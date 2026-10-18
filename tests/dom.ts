import { Window } from "happy-dom";
export const browser = new Window({ url: "http://localhost" });
Object.defineProperties(globalThis, {
  window: { value: browser, configurable: true },
  document: { value: browser.document, configurable: true },
  navigator: { value: browser.navigator, configurable: true },
  localStorage: { value: browser.localStorage, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true, writable: true },
});
