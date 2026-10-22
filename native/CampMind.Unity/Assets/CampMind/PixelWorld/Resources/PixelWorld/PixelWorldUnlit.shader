Shader "CampMind/PixelWorldUnlit"
{
    Properties {
        [PerRendererData] _MainTex("Sprite",2D)="white"{}
        [PerRendererData] _WaterMask("Water mask",2D)="black"{}
        [PerRendererData] _MotionKind("Motion kind",Float)=0
        [PerRendererData] _TreeBounds("Tree bounds",Vector)=(0,1,0,0)
        _TreeSway("Crown sway in world units",Float)=.48
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" "CanUseSpriteAtlas"="True" }
        Cull Off ZWrite Off Blend SrcAlpha OneMinusSrcAlpha
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            TEXTURE2D(_WaterMask); SAMPLER(sampler_WaterMask);
            float _MotionKind,_MotionTime,_TreeSway;
            float4 _TreeBounds,_Wind;
            struct Attributes {float3 positionOS:POSITION;float2 uv:TEXCOORD0;half4 color:COLOR;};
            struct Varyings {float4 positionCS:SV_POSITION;float2 uv:TEXCOORD0;half4 color:COLOR;float2 world:TEXCOORD1;};
            Varyings Vert(Attributes v)
            {
                Varyings o;float3 world=TransformObjectToWorld(v.positionOS);
                if(_MotionKind>.5&&_MotionKind<1.5){
                    // Foot vertices stay fixed. World-position phase avoids a synchronized forest.
                    float height=saturate((v.uv.y-_TreeBounds.x)/max(.001,_TreeBounds.y));
                    float phase=world.x*.19+world.y*.13;
                    float breath=sin(_MotionTime*1.35+phase)*.72+sin(_MotionTime*2.13+phase*1.7)*.28;
                    float sway=_Wind.z*(.28+breath*.72)*height*height;
                    float2 direction=float2(_Wind.x,_Wind.y*.55);
                    direction/=max(.001,length(direction));
                    world.xy+=direction*sway*_TreeSway;
                }
                o.positionCS=TransformWorldToHClip(world);o.world=world.xy;o.uv=v.uv;o.color=v.color;return o;
            }
            half4 Frag(Varyings i):SV_Target
            {
                half4 color=SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv)*i.color;
                if(_MotionKind>1.5){
                    float water=SAMPLE_TEXTURE2D(_WaterMask,sampler_WaterMask,i.uv).r;
                    // World coordinates preserve phase across chunk seams. Only water changes color.
                    float2 p=float2(i.world.x,-i.world.y/1.35);
                    float wave=sin(p.y*2.4-p.x*.16-_MotionTime*1.8+sin(p.x*.31)*.65);
                    float broken=smoothstep(-.15,.65,sin(p.x*.9+p.y*.12-_MotionTime*.25));
                    float highlight=smoothstep(.84,.99,wave)*broken;
                    float shimmer=sin(p.y*1.3-p.x*.37-_MotionTime*1.1)*.012;
                    color.rgb+=water*(highlight*half3(.075,.13,.12)+shimmer);
                }
                return color;
            }
            ENDHLSL
        }
    }
    Fallback "Sprites/Default"
}
