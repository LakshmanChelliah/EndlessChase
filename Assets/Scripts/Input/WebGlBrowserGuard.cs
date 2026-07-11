using System.Runtime.InteropServices;
using UnityEngine;

namespace EndlessChase.Input
{
    /// <summary>
    /// Calls into WebGL jslib to suppress pull-to-refresh / page scroll on the game canvas.
    /// </summary>
    public static class WebGlBrowserGuard
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        static extern void EC_DisableBrowserGestures();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Init()
        {
            EC_DisableBrowserGestures();
        }
#else
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Init() { }
#endif
    }
}
