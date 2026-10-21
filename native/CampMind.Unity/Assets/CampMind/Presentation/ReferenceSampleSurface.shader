Shader "CampMind/Reference Sample Ground"
{
    Properties { _BaseMap("Rock detail",2D)="white"{} _BaseColor("Tint",Color)=(1,1,1,1) }
    SubShader {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        Pass {
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
            CBUFFER_START(UnityPerMaterial)
            float4 _BaseColor;float4 _BaseMap_ST;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;float4 color:COLOR;};
            struct V {float4 positionCS:SV_POSITION;float3 world:TEXCOORD0;float3 normal:TEXCOORD1;float4 color:COLOR;float fog:TEXCOORD2;};
            V vert(A a){V o;o.world=TransformObjectToWorld(a.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(a.normalOS);o.color=a.color;o.fog=ComputeFogFactor(o.positionCS.z);return o;}
            half4 frag(V i):SV_Target{
                float3 weights=pow(abs(normalize(i.normal)),4);weights/=max(.0001,dot(weights,1));
                half3 detail=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,i.world.yz*.15).rgb*weights.x+SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,i.world.xz*.15).rgb*weights.y+SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,i.world.xy*.15).rgb*weights.z;
                half3 albedo=i.color.rgb*_BaseColor.rgb*lerp(half3(.75,.75,.75),detail*1.7,.45);
                Light light=GetMainLight(TransformWorldToShadowCoord(i.world));half diffuse=saturate(dot(normalize(i.normal),light.direction));
                half3 color=albedo*(SampleSH(normalize(i.normal))+light.color*diffuse*light.shadowAttenuation);
                return half4(MixFog(color,i.fog),1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
    }
}
