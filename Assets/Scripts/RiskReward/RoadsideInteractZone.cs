using EndlessChase.Player;
using UnityEngine;
using UnityEngine.Events;

namespace EndlessChase.RiskReward
{
    /// <summary>
    /// Optional roadside mini-game zone (ATM / convenience store).
    ///
    /// Setup in the editor:
    /// 1. Place this on a curb-side trigger volume (BoxCollider.isTrigger = true)
    ///    next to an ATM or store prop.
    /// 2. Assign a glowing cue on the curb-facing edge:
    ///    - Preferred: unlit / emissive material on a thin strip mesh, or
    ///    - Particle / sprite halo, or
    ///    - Simple MeshRenderer whose color you pulse in Update (matches WebGL
    ///      <c>interactGlow</c> opacity flicker — no custom shader required).
    /// 3. Wire <see cref="OnPromptChanged"/> to your HUD ("Press F to use ATM").
    /// 4. Wire <see cref="OnMiniGameRequested"/> to pause the player and open the
    ///    mini-game UI. Entering the trigger must NEVER auto-start the game.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public sealed class RoadsideInteractZone : MonoBehaviour
    {
        public enum SiteKind
        {
            Atm,
            Store
        }

        [Header("Site")]
        [SerializeField] SiteKind _kind = SiteKind.Atm;
        [SerializeField] string _interactKey = "f";
        [SerializeField] bool _resolved;

        [Header("Glow (optional)")]
        [Tooltip("Curb-side mesh with an unlit/emissive material to pulse.")]
        [SerializeField] Renderer _glowRenderer;
        [SerializeField] Color _glowA = new Color(1f, 0.925f, 0.15f);
        [SerializeField] Color _glowB = Color.white;
        [SerializeField] float _glowHz = 2.1f;

        [Header("Events")]
        public UnityEvent<bool, string> OnPromptChanged;
        public UnityEvent<SiteKind> OnMiniGameRequested;

        LanePlayerController _player;
        bool _playerInside;

        public SiteKind Kind => _kind;
        public bool IsResolved => _resolved;
        public bool PlayerInside => _playerInside;

        void Reset()
        {
            var col = GetComponent<Collider>();
            if (col != null) col.isTrigger = true;
        }

        void Awake()
        {
            _player = FindObjectOfType<LanePlayerController>();
        }

        void OnEnable()
        {
            _resolved = false;
            _playerInside = false;
            SetPrompt(false);
        }

        void Update()
        {
            PulseGlow();
            if (_resolved || !_playerInside || _player == null || !_player.IsAlive) return;

            // Opt-in only — presence shows the prompt; key launches the mini-game.
            if (Input.GetKeyDown(_interactKey) || Input.GetKeyDown(KeyCode.Return))
                TryStartMiniGame();
        }

        void OnTriggerEnter(Collider other)
        {
            if (_resolved) return;
            if (!IsPlayer(other)) return;
            _playerInside = true;
            SetPrompt(true);
        }

        void OnTriggerExit(Collider other)
        {
            if (!IsPlayer(other)) return;
            _playerInside = false;
            SetPrompt(false);
        }

        /// <summary>Call from UI / mobile swipe if you mirror the WebGL curb swipe.</summary>
        public void TryStartMiniGame()
        {
            if (_resolved || !_playerInside) return;
            _resolved = true;
            SetPrompt(false);
            // Consumer should pause LanePlayerController motion and open the mini-game UI.
            OnMiniGameRequested?.Invoke(_kind);
        }

        public void MarkResolved()
        {
            _resolved = true;
            _playerInside = false;
            SetPrompt(false);
        }

        void SetPrompt(bool show)
        {
            string text = show ? PromptText() : string.Empty;
            OnPromptChanged?.Invoke(show, text);
        }

        string PromptText()
        {
            string key = string.IsNullOrEmpty(_interactKey) ? "F" : _interactKey.ToUpperInvariant();
            return _kind == SiteKind.Store
                ? $"PRESS {key} · ENTER STORE"
                : $"PRESS {key} · USE ATM";
        }

        void PulseGlow()
        {
            if (_glowRenderer == null || _resolved) return;
            float t = 0.5f + 0.5f * Mathf.Sin(Time.time * Mathf.PI * 2f * _glowHz);
            Color c = Color.Lerp(_glowA, _glowB, t);
            // Works with Standard (Emission) or unlit/UI materials that expose _Color.
            var mat = _glowRenderer.material;
            if (mat.HasProperty("_EmissionColor"))
            {
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", c * (1.2f + t));
            }
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", c);
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", c);
        }

        static bool IsPlayer(Collider other)
        {
            return other.GetComponentInParent<LanePlayerController>() != null
                || other.CompareTag("Player");
        }
    }
}
