using UnityEngine;

namespace CampMind.Presentation
{
    // Keeps new scenery shaders in the same colour and daylight space as the camera.
    [ExecuteAlways,DefaultExecutionOrder(200)]
    public sealed class NewWorldAtmosphereRuntime:MonoBehaviour
    {
        public Camera target;
        private void OnEnable()
        {
            Apply();
#if UNITY_EDITOR
            if(!Application.isPlaying&&target)Debug.Log($"NewWorld edit-mode lighting initialized: daylight={Shader.GetGlobalFloat("_NewWorldDaylight"):F3}; camera={target.name}",this);
#endif
        }
        private void Start(){Apply();}
        private void LateUpdate(){Apply();}
        private void Apply()
        {
            var camera=target?target:GetComponent<Camera>();if(!camera)return;var sky=camera.backgroundColor.linear;Shader.SetGlobalVector("_NewWorldSkyColor",new Vector4(sky.r,sky.g,sky.b,1));
            float sun=RenderSettings.sun?RenderSettings.sun.intensity:0;float strength=Mathf.Clamp01((RenderSettings.ambientLight.grayscale*.65f+sun*.35f)/.76f);Shader.SetGlobalFloat("_NewWorldDaylight",Mathf.Max(.025f,strength));
        }
    }
}
