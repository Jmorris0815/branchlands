// Phone or desktop? Sets <html data-device="phone|desktop"> early so the CSS can lay the page out before
// first paint. Order of truth: ?device= in the URL, a saved choice (localStorage "bh-device", the same key
// the family games hub uses), then a guess from the screen. If the games hub already decided (its own
// shared/device.js runs first inside the hub), this does nothing.
(() => {
  const root = document.documentElement;
  if (root.dataset.device) return;
  const q = new URLSearchParams(location.search).get("device");
  let saved = null; try { saved = localStorage.getItem("bh-device"); } catch (e) { }
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  const guess = coarse && Math.min(innerWidth, innerHeight) < 820 ? "phone" : "desktop";
  const d = q === "phone" || q === "desktop" ? q : saved === "phone" || saved === "desktop" ? saved : guess;
  if (q === "phone" || q === "desktop") try { localStorage.setItem("bh-device", q); } catch (e) { }
  root.dataset.device = d;
  window.BHDevice = window.BHDevice || {
    get: () => root.dataset.device,
    set: (v) => { root.dataset.device = v; try { v ? localStorage.setItem("bh-device", v) : localStorage.removeItem("bh-device"); } catch (e) { } },
  };
})();
