using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
namespace CampMind.Presentation
{
    // Read-only local camp overview. It never writes exploration or simulation state.
    public sealed class NativeEagleMap:MonoBehaviour,IPointerClickHandler
    {
        readonly RenderPipeline.StandardRequest renderRequest=new RenderPipeline.StandardRequest();
        NativeCampView view;RawImage image;Camera cameraView;RenderTexture texture;Vector3 center;float half,next;RectTransform marker;
        public void Initialize(NativeCampView target)
        {
            view=target;image=GetComponent<RawImage>();image.color=Color.white;if(!Application.isPlaying)return;
            var go=new GameObject("鹰眼本地营地相机");go.transform.SetParent(transform,false);cameraView=go.AddComponent<Camera>();cameraView.enabled=false;cameraView.orthographic=true;cameraView.clearFlags=CameraClearFlags.SolidColor;cameraView.backgroundColor=new Color32(58,77,51,255);cameraView.nearClipPlane=.3f;cameraView.farClipPlane=2200;cameraView.cullingMask=~(1<<5);cameraView.allowHDR=true;cameraView.GetUniversalAdditionalCameraData().renderPostProcessing=true;
            texture=new RenderTexture(384,384,24,RenderTextureFormat.ARGBHalf){name="本地营地鹰眼",antiAliasing=2};texture.Create();image.texture=texture;cameraView.targetTexture=texture;
            var markerGo=new GameObject("领主位置",typeof(RectTransform));markerGo.transform.SetParent(transform,false);marker=markerGo.GetComponent<RectTransform>();marker.anchorMin=marker.anchorMax=new Vector2(.5f,.5f);marker.sizeDelta=new Vector2(24,24);var graphic=ReferenceUiArt.Atlas(marker,"ReferenceUtility",2);graphic.color=ReferenceUiArt.Gold;graphic.raycastTarget=false;
        }
        void LateUpdate()
        {
            if(view?.viewCamera==null||cameraView==null)return;
            var profile=view.GetComponent<NewWorldGameProfile>();center=profile!=null?profile.referenceFocus:view.focus;
            half=profile!=null?Mathf.Clamp(Vector3.Distance(profile.referencePosition,profile.referenceFocus)*Mathf.Tan(profile.referenceFov*Mathf.Deg2Rad/2)*2.35f,35,300):90;
            if(view.ExternalMapMode){center=view.Space.ToUnity(view.ExternalMapHome,0);half=220;}
            cameraView.cullingMask=view.viewCamera.cullingMask&~(1<<5);cameraView.orthographicSize=half;cameraView.transform.SetPositionAndRotation(center+Vector3.up*1000,Quaternion.Euler(90,0,0));
            if(view.ExternalMapMode)cameraView.transform.SetPositionAndRotation(center+Vector3.back*1000,Quaternion.identity);
            if(Time.unscaledTime>=next){next=Time.unscaledTime+3;System.Action render=()=>{if(GraphicsSettings.currentRenderPipeline==null)cameraView.Render();else{renderRequest.destination=texture;RenderPipeline.SubmitRenderRequest(cameraView,renderRequest);}};if(view.ExternalMapMode&&view.ExternalMapRender!=null)view.ExternalMapRender(render);else render();}
            if(view.lord!=null){var delta=view.lord.position-center;var r=((RectTransform)transform).rect;marker.anchoredPosition=new Vector2(delta.x/(half*2)*r.width,(view.ExternalMapMode?delta.y:delta.z)/(half*2)*r.height);marker.gameObject.SetActive(Mathf.Abs(delta.x)<half&&Mathf.Abs(view.ExternalMapMode?delta.y:delta.z)<half);}
        }
        public void OnPointerClick(PointerEventData data){if(view==null)return;RectTransformUtility.ScreenPointToLocalPointInRectangle((RectTransform)transform,data.position,data.pressEventCamera,out var point);var r=((RectTransform)transform).rect;view.focus=new Vector3(center.x+point.x/r.width*half*2,view.focus.y,center.z+point.y/r.height*half*2);if(view.ExternalMapMode)view.focus=new Vector3(center.x+point.x/r.width*half*2,center.y+point.y/r.height*half*2,center.z);view.lordView=false;}
        void OnDestroy(){if(cameraView!=null)Destroy(cameraView.gameObject);if(texture!=null){texture.Release();Destroy(texture);}}
    }
}
