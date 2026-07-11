mergeInto(LibraryManager.library, {
  EC_DisableBrowserGestures: function () {
    try {
      var canvas = document.querySelector("#unity-canvas") || document.querySelector("canvas");
      if (!canvas) return;
      canvas.style.touchAction = "none";
      document.body.style.overscrollBehavior = "none";
      document.documentElement.style.overscrollBehavior = "none";

      var block = function (e) {
        if (e.cancelable) e.preventDefault();
      };

      canvas.addEventListener("touchmove", block, { passive: false });
      canvas.addEventListener("gesturestart", block, { passive: false });
      document.addEventListener("touchmove", function (e) {
        if (e.target === canvas || canvas.contains(e.target)) {
          if (e.cancelable) e.preventDefault();
        }
      }, { passive: false });
    } catch (err) {
      console.warn("EC_DisableBrowserGestures", err);
    }
  }
});
