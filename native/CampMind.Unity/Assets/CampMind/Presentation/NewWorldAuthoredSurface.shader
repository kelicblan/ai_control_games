Shader "CampMind/New World Authored Surface"
{
    Properties { _BaseMap("Authored albedo",2D)="white"{} _NormalMap("Authored surface normal",2D)="bump"{} _NormalEnabled("Use source normal",Float)=0 _BaseColor("Tint",Color)=(1,1,1,1) _Haze("Layer haze",Range(0,1))=.1 _BaseFade("Distant base fade",Range(0,1))=0 }
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
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Packing.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;half _Haze;half _BaseFade;half _NormalEnabled;
            CBUFFER_END
            float4 _NewWorldSkyColor;
            TEXTURE2D(_BaseMap);SAMPLER(sampler_BaseMap);TEXTURE2D(_NormalMap);SAMPLER(sampler_NormalMap);
            struct Input{float4 positionOS:POSITION;float3 normalOS:NORMAL;float4 tangentOS:TANGENT;float2 uv:TEXCOORD0;half4 color:COLOR;};
            struct Vary{float4 positionCS:SV_POSITION;float3 normal:TEXCOORD0;float2 uv:TEXCOORD1;float3 world:TEXCOORD2;half elevation:TEXCOORD3;half3 tangent:TEXCOORD4;half3 bitangent:TEXCOORD5;};
            Vary Vert(Input i){Vary o;o.world=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(i.normalOS);o.tangent=TransformObjectToWorldDir(i.tangentOS.xyz);o.bitangent=cross(o.normal,o.tangent)*i.tangentOS.w*GetOddNegativeScale();o.uv=i.uv;o.elevation=i.color.a;return o;}
            half4 Frag(Vary i):SV_Target
            {
                half3 albedo=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,i.uv).rgb*_BaseColor.rgb;
                half3 normal=normalize(i.normal);half3 detail=UnpackNormal(SAMPLE_TEXTURE2D(_NormalMap,sampler_NormalMap,i.uv));detail.xy*=.65;detail.z=sqrt(saturate(1-dot(detail.xy,detail.xy)));normal=normalize(lerp(normal,i.tangent*detail.x+i.bitangent*detail.y+normal*detail.z,_NormalEnabled));
                Light light=GetMainLight();half diffuse=saturate(dot(normal,light.direction));
                half3 colour=albedo*(SampleSH(normal)*.65+light.color*(.35+.45*diffuse));
                float aerial=saturate((distance(_WorldSpaceCameraPos,i.world)-260)/400);
                float haze=saturate(_Haze+aerial*.25);haze=lerp(haze,1,(1-smoothstep(0,.45,i.elevation))*_BaseFade);
                colour=lerp(colour,_NewWorldSkyColor.rgb,haze);
                return half4(colour,1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
    }
}
