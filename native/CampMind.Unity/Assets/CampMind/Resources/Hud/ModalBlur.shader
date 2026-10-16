Shader "CampMind/UI/ModalBlur"
{
 Properties { _MainTex ("Captured screen", 2D) = "black" {} }
 SubShader { Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
 Cull Off Lighting Off ZWrite Off ZTest Always Blend SrcAlpha OneMinusSrcAlpha
 Pass { HLSLPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct appdata { float4 vertex:POSITION;float2 uv:TEXCOORD0;float4 color:COLOR; };
 struct v2f { float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;float4 color:COLOR; };
 sampler2D _MainTex;float4 _MainTex_TexelSize;
 v2f vert(appdata v){v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=v.uv;o.color=v.color;return o;}
 float4 frag(v2f i):SV_Target
 {
  float3 sum=0;float weight=0;
  for(int y=-3;y<=3;y++)for(int x=-3;x<=3;x++){float w=exp(-(x*x+y*y)/5.0);sum+=tex2D(_MainTex,i.uv+float2(x,y)*_MainTex_TexelSize.xy*2.5).rgb*w;weight+=w;}
  float3 blurred=sum/weight;
  #ifndef UNITY_COLORSPACE_GAMMA
  blurred=LinearToGammaSpace(blurred);
  #endif
  blurred=lerp(blurred,float3(6,21,14)/255.0,.78);
  #ifndef UNITY_COLORSPACE_GAMMA
  blurred=GammaToLinearSpace(blurred);
  #endif
  return float4(blurred,1)*i.color;
 }
 ENDHLSL }
 }
}
