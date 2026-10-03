"use client";

import { Headphones, Pause, Play } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { TopicPicker } from "@/components/TopicPicker";
import { Button, Card, ErrorBanner } from "@/components/ui";
import { callApi } from "@/lib/api-client";
import type { PodcastScript } from "@/lib/claude";
import { getMaterial, podcastRepo, type Material } from "@/lib/db";
import { isSpeechSynthesisSupported, speak, stopSpeaking } from "@/lib/speech";

export default function PodcastPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null>(null);
  const [topic, setTopic] = useState("");
  const [podcast, setPodcast] = useState<PodcastScript | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMaterial(id).then((m) => {
      setMaterial(m ?? null);
      if (m) setTopic(m.analysis.topics[0] ?? m.analysis.subject);
    });
    return () => stopSpeaking();
  }, [id]);

  async function generate() {
    if (!material) return;
    setLoading(true);
    setError(null);
    stopSpeaking();
    setPlaying(false);
    try {
      const { podcast } = await callApi<{ podcast: PodcastScript }>("/api/podcast", {
        topic,
        context: material.context,
      });
      setPodcast(podcast);
      await podcastRepo.create(id, podcast);
    } catch (err) {
      setError(err instanceof Error ? err.message : "產生 Podcast 失敗，請再試一次。");
    } finally {
      setLoading(false);
    }
  }

  function togglePlay() {
    if (!podcast) return;
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    speak(podcast.script, () => setPlaying(false));
  }

  if (!material) return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Headphones className="text-[var(--color-accent)]" size={20} />
        <h1 className="text-xl font-semibold">主題 Podcast</h1>
      </div>

      <TopicPicker topics={material.analysis.topics} selected={topic} onSelect={setTopic} />

      <Button onClick={generate} loading={loading} className="self-start">
        {podcast ? "重新產生這個主題的 Podcast" : "產生 Podcast 腳本"}
      </Button>

      {error && <ErrorBanner message={error} />}
      {!isSpeechSynthesisSupported() && (
        <ErrorBanner message="這個瀏覽器不支援語音朗讀功能，仍然可以閱讀文字腳本。" />
      )}

      {podcast && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{podcast.title}</h2>
            {isSpeechSynthesisSupported() && (
              <Button variant="secondary" onClick={togglePlay}>
                {playing ? <Pause size={16} /> : <Play size={16} />}
                {playing ? "停止" : "播放"}
              </Button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">{podcast.script}</p>
        </Card>
      )}
    </div>
  );
}
