using UnityEngine;

namespace EndlessChase.RiskReward
{
    public enum LightState
    {
        Green = 0,
        Yellow = 1,
        Red = 2
    }

    /// <summary>
    /// Timed traffic light cycle for intersection tiles.
    /// </summary>
    public sealed class TrafficLightController : MonoBehaviour
    {
        [SerializeField] float _greenDuration = 2.2f;
        [SerializeField] float _yellowDuration = 0.7f;
        [SerializeField] float _redDuration = 2.0f;
        [SerializeField] Renderer[] _lampRenderers;
        [SerializeField] Color _green = new Color(0.024f, 0.839f, 0.627f);
        [SerializeField] Color _yellow = new Color(1f, 0.84f, 0f);
        [SerializeField] Color _red = new Color(0.937f, 0.137f, 0.235f);

        public LightState State { get; private set; } = LightState.Green;
        public bool IsActive { get; private set; }

        float _timer;

        public void ResetCycle(bool active)
        {
            IsActive = active;
            State = LightState.Green;
            _timer = _greenDuration * Random.Range(0.4f, 1f);
            ApplyVisual();
        }

        void Update()
        {
            if (!IsActive) return;

            _timer -= Time.deltaTime;
            if (_timer > 0f) return;

            switch (State)
            {
                case LightState.Green:
                    State = LightState.Yellow;
                    _timer = _yellowDuration;
                    break;
                case LightState.Yellow:
                    State = LightState.Red;
                    _timer = _redDuration;
                    break;
                default:
                    State = LightState.Green;
                    _timer = _greenDuration;
                    break;
            }

            ApplyVisual();
        }

        void ApplyVisual()
        {
            if (_lampRenderers == null || _lampRenderers.Length == 0) return;
            Color c = State == LightState.Green ? _green : State == LightState.Yellow ? _yellow : _red;
            for (int i = 0; i < _lampRenderers.Length; i++)
            {
                if (_lampRenderers[i] != null && _lampRenderers[i].material != null)
                    _lampRenderers[i].material.color = c;
            }
        }
    }
}
