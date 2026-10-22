import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { BookPreview } from "../components/book-preview";

test("preview reader opens, changes image page, zooms, closes and reopens without leaving the page locked", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost:3000" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const values: Record<string, unknown> = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const previousFetch = globalThis.fetch; let fetched = 0; let closed = 0;
  globalThis.fetch = async () => { fetched++; return new Response(JSON.stringify({ assets: [{ id: "page1", mime: "image/png", pages: 1, url: "/api/media/page1" }, { id: "page2", mime: "image/png", pages: 1, url: "/api/media/page2" }] }), { headers: { "Content-Type": "application/json" } }); };
  Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { if (this.hasAttribute("open")) { closed++; this.removeAttribute("open"); this.dispatchEvent(new dom.window.Event("close")); } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => { root.render(createElement(BookPreview, { productId: "example-book", title: "নিজস্ব নমুনা", available: true })); });
    const trigger = () => dom.window.document.querySelector<HTMLButtonElement>(".preview-trigger")!;
    await act(async () => { trigger().click(); });
    assert.ok(dom.window.document.querySelector("dialog[open]")); assert.equal(trigger().getAttribute("aria-expanded"), "true"); assert.equal(document.body.style.overflow, "hidden");
    await act(async () => { document.querySelector<HTMLButtonElement>('button[aria-label="পরের পৃষ্ঠা"]')!.click(); });
    assert.match(document.querySelector(".reader-surface img")!.getAttribute("alt")!, /২/);
    await act(async () => { document.querySelector<HTMLButtonElement>('button[aria-label="জুম বাড়ান"]')!.click(); });
    assert.equal((document.querySelector(".reader-surface img") as HTMLImageElement).style.width, "120%");
    await act(async () => { document.querySelector<HTMLButtonElement>('button[aria-label="প্রিভিউ বন্ধ করুন"]')!.click(); });
    assert.equal(document.querySelectorAll("dialog[open]").length, 0); assert.equal(trigger().getAttribute("aria-expanded"), "false"); assert.equal(document.body.style.overflow, "");
    await act(async () => { trigger().click(); });
    assert.ok(document.querySelector("dialog[open]")); assert.equal(fetched, 2); assert.match(document.querySelector(".reader-surface img")!.getAttribute("alt")!, /১/);
    await act(async () => root.unmount()); assert.equal(document.body.style.overflow, ""); assert.ok(closed >= 2);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
