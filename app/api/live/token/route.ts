export const dynamic = "force-dynamic";

import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  DAYZA_LIVE_MAX_SESSION_MINUTES,
  DAYZA_LIVE_MODEL,
  dayzaLiveSetup,
} from "@/lib/dayza-live-config";

function futureIso(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limited = rateLimit(req, "gemini-live-token", {
      limit: 20,
      windowMs: 60 * 60 * 1000,
      userId: user.id,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many Live Agent sessions. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Live Dayza is not configured yet. Add GEMINI_API_KEY." }, { status: 503 });
    }

    const model = DAYZA_LIVE_MODEL;
    const setup = dayzaLiveSetup(model);
    const constrainedLiveConfig = {
      responseModalities: setup.generationConfig.responseModalities,
      systemInstruction: setup.systemInstruction,
      tools: setup.tools,
      speechConfig: setup.generationConfig.speechConfig,
      inputAudioTranscription: setup.inputAudioTranscription,
      outputAudioTranscription: setup.outputAudioTranscription,
      realtimeInputConfig: setup.realtimeInputConfig,
      sessionResumption: setup.sessionResumption,
    } as any;
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: futureIso(2 * 60 * 1000),
        expireTime: futureIso(DAYZA_LIVE_MAX_SESSION_MINUTES * 60 * 1000),
        liveConnectConstraints: {
          model,
          config: constrainedLiveConfig,
        },
      },
    });

    if (!token.name) {
      return NextResponse.json({ error: "Gemini did not return a Live token." }, { status: 502 });
    }

    return NextResponse.json({
      token: token.name,
      model,
      setup,
      maxSessionSeconds: DAYZA_LIVE_MAX_SESSION_MINUTES * 60,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not start Live Agent" : error?.message ?? "Could not start Live Agent" },
      { status: 500 }
    );
  }
}
