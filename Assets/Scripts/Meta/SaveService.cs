using System;
using UnityEngine;

namespace EndlessChase.Meta
{
    [Serializable]
    public sealed class SaveData
    {
        public int version = 1;
        public int coins;
        public int topSpeedLevel;
        public int accelerationLevel;
        public int handlingLevel;
    }

    public interface ISaveBackend
    {
        void Write(string key, string json);
        string Read(string key, string fallback = null);
        void Flush();
    }

    /// <summary>
    /// PlayerPrefs backend — on WebGL Unity maps this to IndexedDB/LocalStorage.
    /// Swap for a file backend on iOS without changing UpgradeManager.
    /// </summary>
    public sealed class PlayerPrefsSaveBackend : ISaveBackend
    {
        public void Write(string key, string json)
        {
            PlayerPrefs.SetString(key, json);
        }

        public string Read(string key, string fallback = null)
        {
            return PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : fallback;
        }

        public void Flush()
        {
            PlayerPrefs.Save();
        }
    }

    public sealed class SaveService : MonoBehaviour
    {
        public const string SaveKey = "EndlessChase.Save.v1";
        public static SaveService Instance { get; private set; }

        ISaveBackend _backend;
        SaveData _cache;

        public SaveData Data => _cache;

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            _backend = new PlayerPrefsSaveBackend();
            Load();
        }

        public void Load()
        {
            string json = _backend.Read(SaveKey);
            if (string.IsNullOrEmpty(json))
            {
                _cache = new SaveData();
                return;
            }

            try
            {
                _cache = JsonUtility.FromJson<SaveData>(json) ?? new SaveData();
                if (_cache.version < 1)
                    _cache.version = 1;
            }
            catch
            {
                _cache = new SaveData();
            }
        }

        public void Save()
        {
            if (_cache == null) _cache = new SaveData();
            string json = JsonUtility.ToJson(_cache);
            _backend.Write(SaveKey, json);
            _backend.Flush();
        }

        void OnApplicationPause(bool pause)
        {
            if (pause) Save();
        }

        void OnApplicationQuit()
        {
            Save();
        }
    }
}
