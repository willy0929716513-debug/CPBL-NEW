import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolUnion } from "@anthropic-ai/sdk/resources/messages";

// 固定用同一顆模型，方便之後要換版本時只改這一行。
const MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "沒有設定 ANTHROPIC_API_KEY 環境變數。請到 platform.claude.com 申請一組 API 金鑰，" +
        "寫進專案根目錄的 .env.local 檔案（參考 .env.example）。",
    );
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type MaterialPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }
  | { type: "pdf"; data: string };

function toContentBlocks(parts: MaterialPart[]): Anthropic.Messages.ContentBlockParam[] {
  return parts.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") {
      return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
    }
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: part.data } };
  });
}

/**
 * 強迫 Claude 用一個工具（tool use）回傳結構化 JSON，而不是在一段文字裡
 * 要求「請用 JSON 回答」再自己解析——tool use 是 Anthropic API 官方建議、
 * 可靠度高很多的結構化輸出做法，不會有「模型多講了幾句話導致 JSON.parse
 * 失敗」的問題。
 */
async function askForStructured<T>(params: {
  system: string;
  content: Anthropic.Messages.ContentBlockParam[];
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const tool: ToolUnion = {
    name: params.toolName,
    description: params.toolDescription,
    input_schema: {
      type: "object",
      ...params.schema,
    } as Anthropic.Messages.Tool.InputSchema,
  };

  const messages: MessageParam[] = [{ role: "user", content: params.content }];

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    tools: [tool],
    tool_choice: { type: "tool", name: params.toolName },
    messages,
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude 沒有回傳預期的結構化結果，請稍後再試一次。");
  }
  return toolUse.input as T;
}

export interface StudyPlanStep {
  day: number;
  title: string;
  description: string;
  estimatedMinutes: number;
}

export interface MaterialAnalysis {
  subject: string;
  topics: string[];
  summary: string;
  studyPlan: StudyPlanStep[];
}

export async function analyzeMaterial(parts: MaterialPart[]): Promise<MaterialAnalysis> {
  return askForStructured<MaterialAnalysis>({
    system:
      "你是一位專業的全科家教，擅長快速看懂學生上傳的筆記、課本、簡報或考古題，" +
      "抓出重點科目與主題，並規劃一份循序漸進、符合認知負荷的讀書計畫。",
    content: [
      ...toContentBlocks(parts),
      {
        type: "text",
        text: "請分析以上教材內容，判斷科目與重點主題，並產生一份 10 個步驟的個人化讀書計畫。",
      },
    ],
    toolName: "submit_material_analysis",
    toolDescription: "提交教材分析結果與讀書計畫",
    schema: {
      properties: {
        subject: { type: "string", description: "這份教材屬於的科目，例如「高中物理」" },
        topics: { type: "array", items: { type: "string" }, description: "從教材中抓出的重點主題列表" },
        summary: { type: "string", description: "教材內容的簡短摘要（3-5 句話）" },
        studyPlan: {
          type: "array",
          description: "10 個步驟的讀書計畫，難度與份量循序漸進",
          items: {
            type: "object",
            properties: {
              day: { type: "integer" },
              title: { type: "string" },
              description: { type: "string" },
              estimatedMinutes: { type: "integer", description: "預估完成這個步驟需要的分鐘數" },
            },
            required: ["day", "title", "description", "estimatedMinutes"],
          },
        },
      },
      required: ["subject", "topics", "summary", "studyPlan"],
    },
    maxTokens: 4096,
  });
}

export interface LessonSection {
  heading: string;
  content: string;
}

export interface Lesson {
  title: string;
  sections: LessonSection[];
}

export async function generateLesson(topic: string, context: string): Promise<Lesson> {
  return askForStructured<Lesson>({
    system: "你是一位善於用白話文、循序漸進解說觀念的老師，擅長把抽象概念拆成好懂的小段落。",
    content: [
      {
        type: "text",
        text: `教材背景：\n${context}\n\n請針對主題「${topic}」，寫一份導讀課程，分成 4-6 個小節，` +
          "每個小節先講觀念、再舉一個具體例子，語氣像在跟學生面對面講解。",
      },
    ],
    toolName: "submit_lesson",
    toolDescription: "提交導讀課程內容",
    schema: {
      properties: {
        title: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: { heading: { type: "string" }, content: { type: "string" } },
            required: ["heading", "content"],
          },
        },
      },
      required: ["title", "sections"],
    },
  });
}

export interface PodcastScript {
  title: string;
  script: string;
}

export async function generatePodcastScript(topic: string, context: string): Promise<PodcastScript> {
  return askForStructured<PodcastScript>({
    system:
      "你是一位教育 Podcast 主持人，擅長用輕鬆口語的方式，把考試重點講得像在聊天一樣好懂、" +
      "容易記住。腳本會直接拿去給語音合成朗讀，所以要寫成「口語化的連續文字」，不要用條列符號、" +
      "不要有旁白指示（例如「（停頓）」），純粹就是主持人會講出來的話。",
    content: [
      {
        type: "text",
        text: `教材背景：\n${context}\n\n請針對主題「${topic}」寫一集大約 400-600 字的 Podcast 腳本。`,
      },
    ],
    toolName: "submit_podcast_script",
    toolDescription: "提交 Podcast 腳本",
    schema: {
      properties: {
        title: { type: "string" },
        script: { type: "string", description: "口語化、連續文字的朗讀腳本" },
      },
      required: ["title", "script"],
    },
    maxTokens: 2048,
  });
}

export interface Flashcard {
  front: string;
  back: string;
}

export async function generateFlashcards(context: string, count: number): Promise<Flashcard[]> {
  const result = await askForStructured<{ cards: Flashcard[] }>({
    system: "你是一位擅長把重點濃縮成簡潔問答卡片的家教，卡片正面是問題或關鍵詞，背面是簡短精準的答案。",
    content: [
      { type: "text", text: `教材內容：\n${context}\n\n請產生 ${count} 張學習卡（flashcards）。` },
    ],
    toolName: "submit_flashcards",
    toolDescription: "提交 flashcards",
    schema: {
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: { front: { type: "string" }, back: { type: "string" } },
            required: ["front", "back"],
          },
        },
      },
      required: ["cards"],
    },
  });
  return result.cards;
}

export interface QuizQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

export async function generateQuiz(context: string, count: number): Promise<QuizQuestion[]> {
  const result = await askForStructured<{ questions: QuizQuestion[] }>({
    system: "你是一位出題老師，設計選擇題來測驗學生是否真的理解教材內容，選項要有合理的誘答，不要太容易猜。",
    content: [
      { type: "text", text: `教材內容：\n${context}\n\n請出 ${count} 題四選一的選擇題。` },
    ],
    toolName: "submit_quiz",
    toolDescription: "提交測驗題目",
    schema: {
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              choices: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
              correctIndex: { type: "integer", description: "正確答案在 choices 陣列中的索引（0-3）" },
              explanation: { type: "string", description: "為什麼這個答案是對的，簡短解釋" },
            },
            required: ["question", "choices", "correctIndex", "explanation"],
          },
        },
      },
      required: ["questions"],
    },
  });
  return result.questions;
}

export interface WrittenExamQuestion {
  question: string;
  points: number;
}

export interface WrittenExam {
  title: string;
  questions: WrittenExamQuestion[];
}

export async function generateWrittenExam(context: string): Promise<WrittenExam> {
  return askForStructured<WrittenExam>({
    system: "你是一位命題老師，設計一份包含簡答與申論題的筆試，題目配分總和要是 100 分。",
    content: [{ type: "text", text: `教材內容：\n${context}\n\n請命題一份完整的模擬筆試（6-10 題）。` }],
    toolName: "submit_written_exam",
    toolDescription: "提交模擬筆試題目",
    schema: {
      properties: {
        title: { type: "string" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: { question: { type: "string" }, points: { type: "integer" } },
            required: ["question", "points"],
          },
        },
      },
      required: ["title", "questions"],
    },
  });
}

export interface GradedAnswer {
  question: string;
  score: number;
  maxScore: number;
  feedback: string;
}

export interface GradedExam {
  results: GradedAnswer[];
  totalScore: number;
  totalMax: number;
}

export async function gradeWrittenExam(
  questions: WrittenExamQuestion[],
  answers: string[],
): Promise<GradedExam> {
  const qaText = questions
    .map((q, i) => `第 ${i + 1} 題（配分 ${q.points}）：${q.question}\n學生作答：${answers[i] || "（未作答）"}`)
    .join("\n\n");

  const result = await askForStructured<{ results: GradedAnswer[] }>({
    system: "你是一位批改嚴謹但有建設性回饋的老師，依照配分給分，並針對每一題寫出具體的改進建議。",
    content: [{ type: "text", text: `以下是題目與學生作答，請逐題批改給分：\n\n${qaText}` }],
    toolName: "submit_grading",
    toolDescription: "提交批改結果",
    schema: {
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              score: { type: "integer" },
              maxScore: { type: "integer" },
              feedback: { type: "string" },
            },
            required: ["question", "score", "maxScore", "feedback"],
          },
        },
      },
      required: ["results"],
    },
    maxTokens: 4096,
  });

  const totalScore = result.results.reduce((sum, r) => sum + r.score, 0);
  const totalMax = result.results.reduce((sum, r) => sum + r.maxScore, 0);
  return { results: result.results, totalScore, totalMax };
}

export async function generateOralQuestions(context: string, count: number): Promise<string[]> {
  const result = await askForStructured<{ questions: string[] }>({
    system: "你是一位口試官，設計需要學生口頭講解、不能只靠背誦的口試題目。",
    content: [{ type: "text", text: `教材內容：\n${context}\n\n請設計 ${count} 題口試題目。` }],
    toolName: "submit_oral_questions",
    toolDescription: "提交口試題目",
    schema: {
      properties: { questions: { type: "array", items: { type: "string" } } },
      required: ["questions"],
    },
  });
  return result.questions;
}

export interface OralGrade {
  score: number;
  feedback: string;
  modelAnswer: string;
}

export async function gradeOralAnswer(
  context: string,
  question: string,
  transcript: string,
): Promise<OralGrade> {
  return askForStructured<OralGrade>({
    system: "你是一位口試官，根據學生的口頭回答（已轉成文字）評分並給予鼓勵但具體的回饋，滿分 10 分。",
    content: [
      {
        type: "text",
        text: `教材背景：\n${context}\n\n口試題目：${question}\n學生的口頭回答（語音轉文字，可能不完全通順）：${transcript}`,
      },
    ],
    toolName: "submit_oral_grade",
    toolDescription: "提交口試評分",
    schema: {
      properties: {
        score: { type: "integer", description: "0-10 分" },
        feedback: { type: "string" },
        modelAnswer: { type: "string", description: "一個簡短的示範回答，給學生參考" },
      },
      required: ["score", "feedback", "modelAnswer"],
    },
  });
}

export interface SolvedProblem {
  problemText: string;
  steps: string[];
  answer: string;
}

export async function solveFromImage(
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  data: string,
): Promise<SolvedProblem> {
  return askForStructured<SolvedProblem>({
    system: "你是一位耐心的家教，看到題目照片後，先辨識題目文字，再用循序漸進、一步一步的方式引導解題，不要直接跳答案。",
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text: "請辨識這張照片裡的題目，並逐步解題。" },
    ],
    toolName: "submit_solution",
    toolDescription: "提交解題過程",
    schema: {
      properties: {
        problemText: { type: "string", description: "從照片辨識出的題目文字" },
        steps: { type: "array", items: { type: "string" }, description: "逐步解題過程，每個元素是一個步驟" },
        answer: { type: "string", description: "最終答案" },
      },
      required: ["problemText", "steps", "answer"],
    },
  });
}
