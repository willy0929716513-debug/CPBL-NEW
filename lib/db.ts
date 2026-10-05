"use client";

import { createClient } from "./supabase/client";
import type {
  Flashcard,
  GradedExam,
  Lesson,
  MaterialAnalysis,
  OralGrade,
  PodcastScript,
  QuizQuestion,
  WrittenExam,
} from "./claude";
import type { Database } from "./supabase/types";

/**
 * 所有學習資料存在 Supabase（Postgres + Row Level Security），綁定目前
 * 登入的帳號——換瀏覽器、換裝置，登入同一個帳號就會看到同一份資料。
 * 這裡的每個函式維持跟舊版（存在瀏覽器 IndexedDB 那版）完全相同的介面，
 * 呼叫端（app/ 底下的頁面元件）完全不用改。
 *
 * user_id 欄位由資料庫自己用 `default auth.uid()` 補上（見
 * supabase/schema.sql），這裡的 insert 都不用手動帶 user_id；Row Level
 * Security 會確保一個使用者永遠查不到別人的資料，就算前端邏輯有 bug
 * 也一樣擋得住。
 */

export interface Material {
  id: string;
  createdAt: number;
  fileName: string;
  context: string;
  analysis: MaterialAnalysis;
}

export interface FlashcardSet {
  id: string;
  materialId: string;
  createdAt: number;
  cards: Flashcard[];
}

export interface QuizAttempt {
  id: string;
  materialId: string;
  createdAt: number;
  questions: QuizQuestion[];
  answers: (number | null)[];
  completedAt: number | null;
}

export interface WrittenExamAttempt {
  id: string;
  materialId: string;
  createdAt: number;
  exam: WrittenExam;
  answers: string[];
  graded: GradedExam | null;
}

export interface OralSession {
  id: string;
  materialId: string;
  createdAt: number;
  questions: string[];
  results: { question: string; transcript: string; grade: OralGrade }[];
}

export interface LessonRecord {
  id: string;
  materialId: string;
  createdAt: number;
  lesson: Lesson;
}

export interface PodcastRecord {
  id: string;
  materialId: string;
  createdAt: number;
  podcast: PodcastScript;
}

function toEpoch(isoString: string): number {
  return new Date(isoString).getTime();
}

function throwIfError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("沒有收到資料庫回應。");
  return result.data;
}

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

function mapMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    createdAt: toEpoch(row.created_at),
    fileName: row.file_name,
    context: row.context,
    analysis: row.analysis,
  };
}

export async function saveMaterial(input: Omit<Material, "id" | "createdAt">): Promise<Material> {
  const supabase = createClient();
  const result = await supabase
    .from("materials")
    .insert({ file_name: input.fileName, context: input.context, analysis: input.analysis })
    .select()
    .single();
  return mapMaterial(throwIfError(result));
}

export async function listMaterials(): Promise<Material[]> {
  const supabase = createClient();
  const result = await supabase.from("materials").select().order("created_at", { ascending: false });
  return throwIfError(result).map(mapMaterial);
}

export async function getMaterial(id: string): Promise<Material | undefined> {
  const supabase = createClient();
  const { data, error } = await supabase.from("materials").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapMaterial(data) : undefined;
}

export async function deleteMaterial(id: string): Promise<void> {
  const supabase = createClient();
  // 其他表都用 material_id 設了 `on delete cascade`（見 schema.sql），
  // 刪掉這一筆 materials，相關的 flashcard_sets／quiz_attempts／...
  // 全部會被資料庫自動清掉，不用在這裡一個一個表手動刪。
  const { error } = await supabase.from("materials").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

type FlashcardSetRow = Database["public"]["Tables"]["flashcard_sets"]["Row"];

function mapFlashcardSet(row: FlashcardSetRow): FlashcardSet {
  return { id: row.id, materialId: row.material_id, createdAt: toEpoch(row.created_at), cards: row.cards };
}

export const flashcardsRepo = {
  create: async (materialId: string, cards: Flashcard[]): Promise<FlashcardSet> => {
    const supabase = createClient();
    const result = await supabase
      .from("flashcard_sets")
      .insert({ material_id: materialId, cards })
      .select()
      .single();
    return mapFlashcardSet(throwIfError(result));
  },
  listByMaterial: async (materialId: string): Promise<FlashcardSet[]> => {
    const supabase = createClient();
    const result = await supabase
      .from("flashcard_sets")
      .select()
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    return throwIfError(result).map(mapFlashcardSet);
  },
};

type QuizAttemptRow = Database["public"]["Tables"]["quiz_attempts"]["Row"];

function mapQuizAttempt(row: QuizAttemptRow): QuizAttempt {
  return {
    id: row.id,
    materialId: row.material_id,
    createdAt: toEpoch(row.created_at),
    questions: row.questions,
    answers: row.answers,
    completedAt: row.completed_at ? toEpoch(row.completed_at) : null,
  };
}

export const quizRepo = {
  create: async (materialId: string, questions: QuizQuestion[]): Promise<QuizAttempt> => {
    const supabase = createClient();
    const result = await supabase
      .from("quiz_attempts")
      .insert({ material_id: materialId, questions, answers: questions.map(() => null) })
      .select()
      .single();
    return mapQuizAttempt(throwIfError(result));
  },
  update: async (record: QuizAttempt): Promise<void> => {
    const supabase = createClient();
    const { error } = await supabase
      .from("quiz_attempts")
      .update({ answers: record.answers, completed_at: record.completedAt ? new Date(record.completedAt).toISOString() : null })
      .eq("id", record.id);
    if (error) throw new Error(error.message);
  },
  answerQuestion: async (attempt: QuizAttempt, questionIndex: number, choiceIndex: number): Promise<QuizAttempt> => {
    if (attempt.answers[questionIndex] !== null) return attempt;
    const answers = [...attempt.answers];
    answers[questionIndex] = choiceIndex;
    const allAnswered = answers.every((a) => a !== null);
    const updated: QuizAttempt = { ...attempt, answers, completedAt: allAnswered ? Date.now() : null };
    await quizRepo.update(updated);
    return updated;
  },
  listByMaterial: async (materialId: string): Promise<QuizAttempt[]> => {
    const supabase = createClient();
    const result = await supabase
      .from("quiz_attempts")
      .select()
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    return throwIfError(result).map(mapQuizAttempt);
  },
};

type WrittenExamRow = Database["public"]["Tables"]["written_exams"]["Row"];

function mapWrittenExam(row: WrittenExamRow): WrittenExamAttempt {
  return {
    id: row.id,
    materialId: row.material_id,
    createdAt: toEpoch(row.created_at),
    exam: row.exam,
    answers: row.answers,
    graded: row.graded,
  };
}

export const writtenExamRepo = {
  create: async (materialId: string, exam: WrittenExam): Promise<WrittenExamAttempt> => {
    const supabase = createClient();
    const result = await supabase
      .from("written_exams")
      .insert({ material_id: materialId, exam, answers: exam.questions.map(() => "") })
      .select()
      .single();
    return mapWrittenExam(throwIfError(result));
  },
  update: async (record: WrittenExamAttempt): Promise<void> => {
    const supabase = createClient();
    const { error } = await supabase
      .from("written_exams")
      .update({ answers: record.answers, graded: record.graded })
      .eq("id", record.id);
    if (error) throw new Error(error.message);
  },
  listByMaterial: async (materialId: string): Promise<WrittenExamAttempt[]> => {
    const supabase = createClient();
    const result = await supabase
      .from("written_exams")
      .select()
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    return throwIfError(result).map(mapWrittenExam);
  },
};

type OralSessionRow = Database["public"]["Tables"]["oral_sessions"]["Row"];

function mapOralSession(row: OralSessionRow): OralSession {
  return {
    id: row.id,
    materialId: row.material_id,
    createdAt: toEpoch(row.created_at),
    questions: row.questions,
    results: row.results,
  };
}

export const oralSessionRepo = {
  create: async (materialId: string, questions: string[]): Promise<OralSession> => {
    const supabase = createClient();
    const result = await supabase
      .from("oral_sessions")
      .insert({ material_id: materialId, questions, results: [] })
      .select()
      .single();
    return mapOralSession(throwIfError(result));
  },
  update: async (record: OralSession): Promise<void> => {
    const supabase = createClient();
    const { error } = await supabase.from("oral_sessions").update({ results: record.results }).eq("id", record.id);
    if (error) throw new Error(error.message);
  },
  listByMaterial: async (materialId: string): Promise<OralSession[]> => {
    const supabase = createClient();
    const result = await supabase
      .from("oral_sessions")
      .select()
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    return throwIfError(result).map(mapOralSession);
  },
};

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];

function mapLesson(row: LessonRow): LessonRecord {
  return { id: row.id, materialId: row.material_id, createdAt: toEpoch(row.created_at), lesson: row.lesson };
}

export const lessonRepo = {
  create: async (materialId: string, lesson: Lesson): Promise<LessonRecord> => {
    const supabase = createClient();
    const result = await supabase.from("lessons").insert({ material_id: materialId, lesson }).select().single();
    return mapLesson(throwIfError(result));
  },
  listByMaterial: async (materialId: string): Promise<LessonRecord[]> => {
    const supabase = createClient();
    const result = await supabase
      .from("lessons")
      .select()
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    return throwIfError(result).map(mapLesson);
  },
};

type PodcastRow = Database["public"]["Tables"]["podcasts"]["Row"];

function mapPodcast(row: PodcastRow): PodcastRecord {
  return { id: row.id, materialId: row.material_id, createdAt: toEpoch(row.created_at), podcast: row.podcast };
}

export const podcastRepo = {
  create: async (materialId: string, podcast: PodcastScript): Promise<PodcastRecord> => {
    const supabase = createClient();
    const result = await supabase.from("podcasts").insert({ material_id: materialId, podcast }).select().single();
    return mapPodcast(throwIfError(result));
  },
  listByMaterial: async (materialId: string): Promise<PodcastRecord[]> => {
    const supabase = createClient();
    const result = await supabase
      .from("podcasts")
      .select()
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    return throwIfError(result).map(mapPodcast);
  },
};

export async function getProgress(materialId: string): Promise<number[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("study_plan_progress")
    .select("completed_steps")
    .eq("material_id", materialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.completed_steps ?? [];
}

export async function toggleStepComplete(materialId: string, day: number): Promise<number[]> {
  const existing = await getProgress(materialId);
  const completedSteps = existing.includes(day) ? existing.filter((d) => d !== day) : [...existing, day];

  const supabase = createClient();
  const { error } = await supabase
    .from("study_plan_progress")
    .upsert({ material_id: materialId, completed_steps: completedSteps });
  if (error) throw new Error(error.message);
  return completedSteps;
}
