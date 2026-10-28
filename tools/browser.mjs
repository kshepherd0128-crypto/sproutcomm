// Minimal Chrome DevTools Protocol driver used to verify the app in a real
// browser at phone width. No dependencies: Node's global WebSocket + fetch.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME_BIN || '/usr/bin/chromium';
const PORT = Number(process.env.CDP_PORT || 9333);

export class Browser {
  static async launch({ userDataDir = '/tmp/opencode/chromium-sprout' } = {}) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.mkdirSync(userDataDir, { recursive: true });

    const proc = spawn(
      CHROME,
      [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        '--lang=en-US',
        'about:blank'
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    let version = null;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        version = await res.json();
        break;
      } catch {
        await sleep(150);
      }
    }
    if (!version) throw new Error('Chromium did not start');

    const browser = new Browser(proc);
    await browser.connect(version.webSocketDebuggerUrl);
    return browser;
  }

  constructor(proc) {
    this.proc = proc;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect(url) {
    this.ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${JSON.stringify(msg.error.data ?? '')}`));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60000);
    });
  }

  async newPage({ width = 390, height = 844 } = {}) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: width,
      screenHeight: height
    });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    return page;
  }

  async close() {
    try {
      this.ws.close();
    } catch {}
    this.proc.kill('SIGKILL');
  }
}

export class Page {
  constructor(browser, sessionId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.console = [];
    this.errors = [];
    this.browser.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.sessionId !== this.sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled') {
        this.console.push({
          type: msg.params.type,
          text: msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
        });
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.errors.push(msg.params.entry.text);
      }
    });
  }

  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }

  async goto(url) {
    const loaded = new Promise((resolve) => {
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.sessionId === this.sessionId && msg.method === 'Page.loadEventFired') {
          this.browser.ws.removeEventListener('message', handler);
          resolve();
        }
      };
      this.browser.ws.addEventListener('message', handler);
    });
    await this.send('Page.navigate', { url });
    await loaded;
    await sleep(250);
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  async text() {
    return this.eval('document.getElementById("app").innerText');
  }

  async click(selector) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`No element for selector: ${selector}`);
    await sleep(220);
  }

  async clickText(text) {
    const ok = await this.eval(`(() => {
      const els = [...document.querySelectorAll('button, [data-action]')];
      const el = els.find((e) => e.innerText.trim().includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`No clickable element containing: ${text}`);
    await sleep(220);
  }

  async fill(selector, value) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`No input for selector: ${selector}`);
    await sleep(120);
  }

  async submit(selector) {
    const ok = await this.eval(`(() => {
      const form = document.querySelector(${JSON.stringify(selector)});
      if (!form) return false;
      form.requestSubmit();
      return true;
    })()`);
    if (!ok) throw new Error(`No form for selector: ${selector}`);
    await sleep(400);
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  async waitFor(expression, { timeout = 20000, interval = 250 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.eval(expression)) return true;
      await sleep(interval);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
