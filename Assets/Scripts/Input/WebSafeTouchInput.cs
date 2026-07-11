using System;
using UnityEngine;

namespace EndlessChase.Input
{
    public enum SwipeDirection
    {
        None = 0,
        Left,
        Right,
        Up,
        Down
    }

    /// <summary>
    /// Mobile-browser-safe swipe detection. Pairs with WebGL template that sets
    /// touch-action:none and preventDefault on canvas touchmove (no pull-to-refresh).
    /// Keyboard fallback for editor / desktop testing.
    /// </summary>
    public sealed class WebSafeTouchInput : MonoBehaviour
    {
        [SerializeField] float _minSwipePixels = 50f;
        [SerializeField] float _maxSwipeSeconds = 0.45f;
        [SerializeField] bool _enableKeyboard = true;

        public event Action<SwipeDirection> OnSwipe;

        Vector2 _startPos;
        float _startTime;
        int _fingerId = -1;
        bool _tracking;

        void Update()
        {
            PollTouch();
            if (_enableKeyboard)
                PollKeyboard();
        }

        void PollKeyboard()
        {
            if (UnityEngine.Input.GetKeyDown(KeyCode.A) || UnityEngine.Input.GetKeyDown(KeyCode.LeftArrow))
                Emit(SwipeDirection.Left);
            else if (UnityEngine.Input.GetKeyDown(KeyCode.D) || UnityEngine.Input.GetKeyDown(KeyCode.RightArrow))
                Emit(SwipeDirection.Right);
            else if (UnityEngine.Input.GetKeyDown(KeyCode.W) || UnityEngine.Input.GetKeyDown(KeyCode.UpArrow) || UnityEngine.Input.GetKeyDown(KeyCode.Space))
                Emit(SwipeDirection.Up);
            else if (UnityEngine.Input.GetKeyDown(KeyCode.S) || UnityEngine.Input.GetKeyDown(KeyCode.DownArrow))
                Emit(SwipeDirection.Down);
        }

        void PollTouch()
        {
            int count = UnityEngine.Input.touchCount;
            if (count == 0)
            {
                // Mouse as touch for desktop browser testing
                if (UnityEngine.Input.GetMouseButtonDown(0))
                {
                    _tracking = true;
                    _startPos = UnityEngine.Input.mousePosition;
                    _startTime = Time.unscaledTime;
                }
                else if (_tracking && UnityEngine.Input.GetMouseButtonUp(0))
                {
                    TryResolveSwipe(UnityEngine.Input.mousePosition);
                    _tracking = false;
                }
                return;
            }

            // Single-finger only — ignore multi-touch noise
            Touch touch = UnityEngine.Input.GetTouch(0);

            switch (touch.phase)
            {
                case TouchPhase.Began:
                    _fingerId = touch.fingerId;
                    _startPos = touch.position;
                    _startTime = Time.unscaledTime;
                    _tracking = true;
                    break;

                case TouchPhase.Ended:
                case TouchPhase.Canceled:
                    if (_tracking && touch.fingerId == _fingerId)
                    {
                        TryResolveSwipe(touch.position);
                        _tracking = false;
                        _fingerId = -1;
                    }
                    break;
            }
        }

        void TryResolveSwipe(Vector2 endPos)
        {
            float dt = Time.unscaledTime - _startTime;
            if (dt <= 0f || dt > _maxSwipeSeconds) return;

            Vector2 delta = endPos - _startPos;
            float dist = delta.magnitude;
            if (dist < _minSwipePixels) return;

            // Prefer axis with larger movement
            if (Mathf.Abs(delta.x) > Mathf.Abs(delta.y))
                Emit(delta.x > 0f ? SwipeDirection.Right : SwipeDirection.Left);
            else
                Emit(delta.y > 0f ? SwipeDirection.Up : SwipeDirection.Down);
        }

        void Emit(SwipeDirection dir)
        {
            if (dir == SwipeDirection.None) return;
            OnSwipe?.Invoke(dir);
        }
    }
}
