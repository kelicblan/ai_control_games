Shader "CampMind/New World Air Water"
{
    Properties { _BaseColor("Colour",Color)=(.88,.93,.89,.8) _Mist("Mist mode",Float)=0 }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;float _Mist;
            CBUFFER_END
            float _NewWorldDaylight;
            struct Input{float4 positionOS:POSITION;float2 uv:TEXCOORD0;half4 color:COLOR;};
            struct Vary{float4 positionCS:SV_POSITION;float2 uv:TEXCOORD0;half4 color:COLOR;half fog:TEXCOORD1;};
            Vary Vert(Input i){Vary o;o.positionCS=TransformObjectToHClip(i.positionOS.xyz);o.uv=i.uv;o.color=i.color;o.fog=ComputeFogFactor(o.positionCS.z);return o;}
            float Hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            float Noise(float2 p){float2 a=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(Hash(a),Hash(a+float2(1,0)),f.x),lerp(Hash(a+float2(0,1)),Hash(a+1),f.x),f.y);}
            half4 Frag(Vary i):SV_Target
            {
                float2 p=i.uv;float edge=saturate(1-dot((p-.5)*2,(p-.5)*2));
                float n=Noise(p*6+float2(_Time.y*.015,0));
                float mist=pow(edge,1.8)*(.55+.45*n);
                float streak=Noise(float2(p.x*30,p.y*6-_Time.y*1.8));
                float fall=smoothstep(0,.15,p.x)*smoothstep(0,.15,1-p.x)*(.50+.50*streak);
                half alpha=lerp(fall,mist,_Mist)*_BaseColor.a*i.color.a;
                return half4(MixFog(_BaseColor.rgb*lerp(.86+streak*.14,1,_Mist)*max(.025,_NewWorldDaylight),i.fog),alpha);
            }
            ENDHLSL
        }
    }
}
