Shader "CampMind/New World Rock"
{
    Properties { _BaseColor("Rock colour",Color)=(.57,.59,.54,1) _SourceAtlas("New generated rock albedo",2D)="white"{} _UseSourceAtlas("Source albedo blend",Range(0,1))=0 }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
            float _UseSourceAtlas;
            CBUFFER_END
            TEXTURE2D(_SourceAtlas);SAMPLER(sampler_SourceAtlas);
            struct Input { float4 positionOS:POSITION;float3 normalOS:NORMAL; };
            struct Vary { float4 positionCS:SV_POSITION;float3 world:TEXCOORD0;half3 normal:TEXCOORD1;half fog:TEXCOORD2; };
            Vary Vert(Input i){Vary o;o.world=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(i.normalOS);o.fog=ComputeFogFactor(o.positionCS.z);return o;}
            half4 Frag(Vary i):SV_Target
            {
                float fissure=pow(saturate(sin(i.world.x*2.1+i.world.z*.8+sin(i.world.y*.17)*.7)),16);
                float grain=sin(i.world.x*9+i.world.y*13+i.world.z*7)*sin(i.world.z*17-i.world.y*11);
                float ledge=pow(saturate(sin(i.world.y*1.1+sin(i.world.x*.2))),9);
                half3 normal=normalize(i.normal);float3 weights=pow(abs(normal),4);weights/=max(dot(weights,1),.001);
                float3 uv=i.world*.035;half3 atlas=SAMPLE_TEXTURE2D(_SourceAtlas,sampler_SourceAtlas,frac(uv.yz)).rgb*weights.x+SAMPLE_TEXTURE2D(_SourceAtlas,sampler_SourceAtlas,frac(uv.xz)).rgb*weights.y+SAMPLE_TEXTURE2D(_SourceAtlas,sampler_SourceAtlas,frac(uv.xy)).rgb*weights.z;
                half3 colour=lerp(_BaseColor.rgb,atlas,_UseSourceAtlas)*(.97+grain*.025-fissure*.16-ledge*.055);
                float moss=smoothstep(.38,.85,normal.y)*smoothstep(-.2,.65,sin(i.world.x*.6+sin(i.world.z*.37)*2));
                colour=lerp(colour,half3(.40,.48,.29),moss*.55*(1-step(.78,_BaseColor.r)));
                Light light=GetMainLight(TransformWorldToShadowCoord(i.world));
                half3 illumination=SampleSH(normal)+light.color*(saturate(dot(normal,light.direction))*.7+.18)*light.shadowAttenuation;
                return half4(MixFog(colour*illumination,i.fog),1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
    }
}
