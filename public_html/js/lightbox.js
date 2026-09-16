/* Casa Nina — shared lightbox (2026-09-16).
   Any <a data-lightbox href="image.jpg"> on the page opens its image full screen
   in the #lightbox overlay (markup lives in each page), with arrows, keyboard
   and swipe. Pages that use it: gallery.html, the-casa.html. */
(function(){
  var d = document;
  var lb = d.getElementById("lightbox"); if(!lb) return;
  var lbImg = lb.querySelector(".lb__img"), lbText = lb.querySelector(".lb__text"), lbCount = lb.querySelector(".lb__count");
  var items = [].slice.call(d.querySelectorAll("[data-lightbox]")), index = -1, lastFocus = null;
  function show(i){ index = (i + items.length) % items.length; var a = items[index], img = a.querySelector("img");
    lbImg.src = a.getAttribute("href"); lbImg.alt = img ? img.alt : ""; lbText.textContent = img ? img.alt : ""; lbCount.textContent = (index + 1) + " / " + items.length;
    var n = items[(index + 1) % items.length]; if(n){ var pre = new Image(); pre.src = n.getAttribute("href"); } }
  function open(i){ lastFocus = d.activeElement; show(i); lb.hidden = false; d.documentElement.classList.add("lenis-stopped"); d.body.classList.add("lb-open"); lb.querySelector("[data-lb-close]").focus(); }
  function close(){ lb.hidden = true; lbImg.src = ""; d.documentElement.classList.remove("lenis-stopped"); d.body.classList.remove("lb-open"); if(lastFocus) lastFocus.focus(); }
  items.forEach(function(a, i){ a.addEventListener("click", function(e){ e.preventDefault(); open(i); }); });
  lb.querySelector("[data-lb-close]").addEventListener("click", close);
  lb.querySelector("[data-lb-prev]").addEventListener("click", function(){ show(index - 1); });
  lb.querySelector("[data-lb-next]").addEventListener("click", function(){ show(index + 1); });
  lb.addEventListener("click", function(e){ if(e.target === lb) close(); });
  d.addEventListener("keydown", function(e){ if(lb.hidden) return; if(e.key === "Escape") close(); else if(e.key === "ArrowLeft") show(index - 1); else if(e.key === "ArrowRight") show(index + 1); });
  var sx = 0; lb.addEventListener("touchstart", function(e){ sx = e.changedTouches[0].clientX; }, { passive:true });
  lb.addEventListener("touchend", function(e){ var dx = e.changedTouches[0].clientX - sx; if(Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1)); }, { passive:true });
})();
