using UnityEngine;
namespace CampMind.Presentation
{
    // Authored forest props are reused by the existing authority snapshot presenter.
    public sealed class ForestHarvestVisual:MonoBehaviour
    {
        public string siteId;
        public static GameObject Find(string id)
        {
            foreach(var visual in Object.FindObjectsByType<ForestHarvestVisual>(FindObjectsInactive.Include,FindObjectsSortMode.None))if(visual.siteId==id)return visual.gameObject;
            return null;
        }
    }
}
