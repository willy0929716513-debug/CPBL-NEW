"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

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

/**
 * 所有學習資料都存在瀏覽器本機的 IndexedDB，不會送到任何伺服器（除了呼叫
 * Claude API 當下那一次請求）。這個 app 目前沒有帳號系統，所以也沒有
 * 「雲端同步」這回事——換瀏覽器、換裝置、清瀏覽器資料都會讓紀錄消失，
 * 這是刻意的設計取捨（見 README），不是 bug。
 */

export interface Material {
  id: string;
  createdAt: number;
  fileName: string;
  context: string; // 給後續每個功能（出題、批改...）當背景知識用的純文字內容
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

export interface StudyPlanProgress {
  materialId: string;
  completedSteps: number[]; // 完成的 studyPlan.day 編號
}

interface PathlightDB extends DBSchema {
  materials: { key: string; value: Material };
  flashcardSets: { key: string; value: FlashcardSet; indexes: { materialId: string } };
  quizAttempts: { key: string; value: QuizAttempt; indexes: { materialId: string } };
  writtenExams: { key: string; value: WrittenExamAttempt; indexes: { materialId: string } };
  oralSessions: { key: string; value: OralSession; indexes: { materialId: string } };
  lessons: { key: string; value: LessonRecord; indexes: { materialId: string } };
  podcasts: { key: string; value: PodcastRecord; indexes: { materialId: string } };
  studyPlanProgress: { key: string; value: StudyPlanProgress }; // key = materialId
}

let dbPromise: Promise<IDBPDatabase<PathlightDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PathlightDB>> {
  dbPromise ??= openDB<PathlightDB>("pathlight", 1, {
    upgrade(db) {
      db.createObjectStore("materials", { keyPath: "id" });
      for (const name of ["flashcardSets", "quizAttempts", "writtenExams", "oralSessions", "lessons", "podcasts"] as const) {
        const store = db.createObjectStore(name, { keyPath: "id" });
        store.createIndex("materialId", "materialId");
      }
      db.createObjectStore("studyPlanProgress", { keyPath: "materialId" });
    },
  });
  return dbPromise;
}

function newId(): string {
  return crypto.randomUUID();
}

export async function saveMaterial(input: Omit<Material, "id" | "createdAt">): Promise<Material> {
  const material: Material = { ...input, id: newId(), createdAt: Date.now() };
  const db = await getDB();
  await db.put("materials", material);
  return material;
}

export async function listMaterials(): Promise<Material[]> {
  const db = await getDB();
  const all = await db.getAll("materials");
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getMaterial(id: string): Promise<Material | undefined> {
  const db = await getDB();
  return db.get("materials", id);
}

// idb 的 TypeScript 型別定義裡，index.iterate() 的 key 型別是從 storeName
// 這個泛型參數條件推導出來的——在泛型函式「本體內」（storeName 還沒被換成
// 具體字面值型別的階段），TypeScript 沒辦法把這種條件型別化簡回 string，
// 這是 TS 已知的限制，不是我們邏輯寫錯。這裡用一個窄範圍的型別斷言繞過去
// （materialId 本來就保證是 string，執行時期行為完全正確）。
async function deleteFromStore<Name extends "flashcardSets" | "quizAttempts" | "writtenExams" | "oralSessions" | "lessons" | "podcasts">(
  db: IDBPDatabase<PathlightDB>,
  storeName: Name,
  materialId: string,
): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  const index = tx.store.index("materialId");
  for await (const cursor of index.iterate(materialId as never)) {
    await cursor.delete();
  }
  await tx.done;
}

export async function deleteMaterial(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("materials", id);
  await db.delete("studyPlanProgress", id);
  await deleteFromStore(db, "flashcardSets", id);
  await deleteFromStore(db, "quizAttempts", id);
  await deleteFromStore(db, "writtenExams", id);
  await deleteFromStore(db, "oralSessions", id);
  await deleteFromStore(db, "lessons", id);
  await deleteFromStore(db, "podcasts", id);
}

async function saveRecord<Name extends "flashcardSets" | "quizAttempts" | "writtenExams" | "oralSessions" | "lessons" | "podcasts">(
  storeName: Name,
  record: PathlightDB[Name]["value"],
): Promise<void> {
  const db = await getDB();
  await db.put(storeName, record);
}

async function listRecords<Name extends "flashcardSets" | "quizAttempts" | "writtenExams" | "oralSessions" | "lessons" | "podcasts">(
  storeName: Name,
  materialId: string,
): Promise<PathlightDB[Name]["value"][]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(storeName, "materialId", materialId as never);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const flashcardsRepo = {
  create: (materialId: string, cards: Flashcard[]): Promise<FlashcardSet> => {
    const record: FlashcardSet = { id: newId(), materialId, createdAt: Date.now(), cards };
    return saveRecord("flashcardSets", record).then(() => record);
  },
  listByMaterial: (materialId: string) => listRecords("flashcardSets", materialId),
};

export const quizRepo = {
  create: (materialId: string, questions: QuizQuestion[]): Promise<QuizAttempt> => {
    const record: QuizAttempt = {
      id: newId(),
      materialId,
      createdAt: Date.now(),
      questions,
      answers: questions.map(() => null),
      completedAt: null,
    };
    return saveRecord("quizAttempts", record).then(() => record);
  },
  update: (record: QuizAttempt) => saveRecord("quizAttempts", record),
  // 把「答案已經作答過就不能改」+「算有沒有全部答完」+「蓋上完成時間戳記」
  // 這幾件跟時間／資料正確性有關的邏輯放在這裡，而不是放在畫面元件裡
  // 呼叫 Date.now()——React 19 的 eslint-plugin-react-hooks 新增的
  // purity 規則會擋下任何在元件檔案裡呼叫的非純函式（即使是在事件處理
  // 函式裡），資料層本來就不受這條規則限制，邏輯放這裡也更合理。
  answerQuestion: async (attempt: QuizAttempt, questionIndex: number, choiceIndex: number): Promise<QuizAttempt> => {
    if (attempt.answers[questionIndex] !== null) return attempt;
    const answers = [...attempt.answers];
    answers[questionIndex] = choiceIndex;
    const allAnswered = answers.every((a) => a !== null);
    const updated: QuizAttempt = { ...attempt, answers, completedAt: allAnswered ? Date.now() : null };
    await saveRecord("quizAttempts", updated);
    return updated;
  },
  listByMaterial: (materialId: string) => listRecords("quizAttempts", materialId),
};

export const writtenExamRepo = {
  create: (materialId: string, exam: WrittenExam): Promise<WrittenExamAttempt> => {
    const record: WrittenExamAttempt = {
      id: newId(),
      materialId,
      createdAt: Date.now(),
      exam,
      answers: exam.questions.map(() => ""),
      graded: null,
    };
    return saveRecord("writtenExams", record).then(() => record);
  },
  update: (record: WrittenExamAttempt) => saveRecord("writtenExams", record),
  listByMaterial: (materialId: string) => listRecords("writtenExams", materialId),
};

export const oralSessionRepo = {
  create: (materialId: string, questions: string[]): Promise<OralSession> => {
    const record: OralSession = { id: newId(), materialId, createdAt: Date.now(), questions, results: [] };
    return saveRecord("oralSessions", record).then(() => record);
  },
  update: (record: OralSession) => saveRecord("oralSessions", record),
  listByMaterial: (materialId: string) => listRecords("oralSessions", materialId),
};

export const lessonRepo = {
  create: (materialId: string, lesson: Lesson): Promise<LessonRecord> => {
    const record: LessonRecord = { id: newId(), materialId, createdAt: Date.now(), lesson };
    return saveRecord("lessons", record).then(() => record);
  },
  listByMaterial: (materialId: string) => listRecords("lessons", materialId),
};

export const podcastRepo = {
  create: (materialId: string, podcast: PodcastScript): Promise<PodcastRecord> => {
    const record: PodcastRecord = { id: newId(), materialId, createdAt: Date.now(), podcast };
    return saveRecord("podcasts", record).then(() => record);
  },
  listByMaterial: (materialId: string) => listRecords("podcasts", materialId),
};

export async function getProgress(materialId: string): Promise<number[]> {
  const db = await getDB();
  const record = await db.get("studyPlanProgress", materialId);
  return record?.completedSteps ?? [];
}

export async function toggleStepComplete(materialId: string, day: number): Promise<number[]> {
  const db = await getDB();
  const existing = (await db.get("studyPlanProgress", materialId))?.completedSteps ?? [];
  const completedSteps = existing.includes(day) ? existing.filter((d) => d !== day) : [...existing, day];
  await db.put("studyPlanProgress", { materialId, completedSteps });
  return completedSteps;
}
