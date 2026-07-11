using UnityEngine;
using UnityEngine.UI;

namespace EndlessChase.UI
{
    public sealed class HUDView : MonoBehaviour
    {
        [SerializeField] Text _distanceText;
        [SerializeField] Text _coinsText;
        [SerializeField] Text _boostText;
        [SerializeField] Text _gameOverScoreText;
        [SerializeField] Text _gameOverCoinsText;
        [SerializeField] Text _lightHintText;

        public void SetRunStats(float distance, int coins, bool boosting)
        {
            if (_distanceText) _distanceText.text = $"{Mathf.FloorToInt(distance)} m";
            if (_coinsText) _coinsText.text = coins.ToString();
            if (_boostText) _boostText.gameObject.SetActive(boosting);
        }

        public void SetLightHint(string message)
        {
            if (_lightHintText == null) return;
            _lightHintText.gameObject.SetActive(!string.IsNullOrEmpty(message));
            _lightHintText.text = message ?? string.Empty;
        }

        public void SetGameOver(float distance, int runCoins)
        {
            if (_gameOverScoreText) _gameOverScoreText.text = $"{Mathf.FloorToInt(distance)} m";
            if (_gameOverCoinsText) _gameOverCoinsText.text = $"+{runCoins}";
        }
    }
}
