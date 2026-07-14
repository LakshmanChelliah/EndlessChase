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
    /// Swipes fire once the distance threshold is crossed (no max-duration gate),
    /// so slow deliberate gestures still register.
    /// </summary>
    public sealed class WebSafeTouchInput : MonoBehaviour
    {
        [SerializeField] float _minSwipePixels = 40f;
        [SerializeField] bool _enableKeyboard = true;

        public event Action<SwipeDirection> OnSwipe;

        Vector2 _startPos;
        int _fingerId = -1;
        bool _tracking;
        bool _consumed;

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
                    _consumed = false;
                    _startPos = UnityEngine.Input.mousePosition;
                    _fingerId = -1;
                }
                else if (_tracking && _fingerId < 0)
                {
                    if (!_consumed)
                        TryResolveSwipe(UnityEngine.Input.mousePosition);

                    if (UnityEngine.Input.GetMouseButtonUp(0))
                    {
                        if (!_consumed)
                            TryResolveSwipe(UnityEngine.Input.mousePosition);
                        _tracking = false;
                        _consumed = false;
                    }
                }
                return;
            }

            // Prefer the finger we already started tracking
            Touch touch = default;
            bool found = false;
            if (_tracking && _fingerId >= 0)
            {
                for (int i = 0; i < count; i++)
                {
                    Touch t = UnityEngine.Input.GetTouch(i);
                    if (t.fingerId == _fingerId)
                    {
                        touch = t;
                        found = true;
                        break;
                    }
                }
            }

            if (!found)
            {
                // Single-finger only — ignore multi-touch noise while idle
                if (_tracking)
                {
                    // Tracked finger vanished without Ended/Canceled — drop gesture
                    _tracking = false;
                    _consumed = false;
                    _fingerId = -1;
                    return;
                }
                touch = UnityEngine.Input.GetTouch(0);
            }

            switch (touch.phase)
            {
                case TouchPhase.Began:
                    if (_tracking) break;
                    _fingerId = touch.fingerId;
                    _startPos = touch.position;
                    _tracking = true;
                    _consumed = false;
                    break;

                case TouchPhase.Moved:
                case TouchPhase.Stationary:
                    if (_tracking && touch.fingerId == _fingerId && !_consumed)
                        TryResolveSwipe(touch.position);
                    break;

                case TouchPhase.Ended:
                case TouchPhase.Canceled:
                    if (_tracking && touch.fingerId == _fingerId)
                    {
                        if (!_consumed)
                            TryResolveSwipe(touch.position);
                        _tracking = false;
                        _consumed = false;
                        _fingerId = -1;
                    }
                    break;
            }
        }

        void TryResolveSwipe(Vector2 endPos)
        {
            Vector2 delta = endPos - _startPos;
            float dist = delta.magnitude;
            if (dist < _minSwipePixels) return;

            // Prefer axis with larger movement
            if (Mathf.Abs(delta.x) > Mathf.Abs(delta.y))
                Emit(delta.x > 0f ? SwipeDirection.Right : SwipeDirection.Left);
            else
                Emit(delta.y > 0f ? SwipeDirection.Up : SwipeDirection.Down);

            _consumed = true;
        }

        void Emit(SwipeDirection dir)
        {
            if (dir == SwipeDirection.None) return;
            OnSwipe?.Invoke(dir);
        }
    }
}
