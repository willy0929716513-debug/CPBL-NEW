import type { Flashcard, GradedExam, Lesson, MaterialAnalysis, OralGrade, PodcastScript, QuizQuestion, WrittenExam } from "@/lib/claude";

/**
 * 手寫的資料庫型別定義，對應 supabase/schema.sql 建出來的資料表結構。
 * 正式的做法是用 `supabase gen types typescript` 從真正的專案產生，但這裡
 * 沒有網路連線連到任何 Supabase 專案，沒辦法跑那個指令——先手寫對應
 * schema.sql 的型別，等你實際建好專案後，可以跑那個指令重新產生、覆蓋
 * 這個檔案，確保跟資料庫結構完全同步。
 */
export interface Database {
  public: {
    Tables: {
      materials: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          file_name: string;
          context: string;
          analysis: MaterialAnalysis;
        };
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          file_name: string;
          context: string;
          analysis: MaterialAnalysis;
        };
        Update: Partial<Database["public"]["Tables"]["materials"]["Insert"]>;
        Relationships: [];
      };
      study_plan_progress: {
        Row: { material_id: string; user_id: string; completed_steps: number[] };
        Insert: { material_id: string; user_id?: string; completed_steps?: number[] };
        Update: Partial<Database["public"]["Tables"]["study_plan_progress"]["Insert"]>;
        Relationships: [];
      };
      flashcard_sets: {
        Row: { id: string; user_id: string; material_id: string; created_at: string; cards: Flashcard[] };
        Insert: {
          id?: string;
          user_id?: string;
          material_id: string;
          created_at?: string;
          cards: Flashcard[];
        };
        Update: Partial<Database["public"]["Tables"]["flashcard_sets"]["Insert"]>;
        Relationships: [];
      };
      quiz_attempts: {
        Row: {
          id: string;
          user_id: string;
          material_id: string;
          created_at: string;
          questions: QuizQuestion[];
          answers: (number | null)[];
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          material_id: string;
          created_at?: string;
          questions: QuizQuestion[];
          answers: (number | null)[];
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_attempts"]["Insert"]>;
        Relationships: [];
      };
      written_exams: {
        Row: {
          id: string;
          user_id: string;
          material_id: string;
          created_at: string;
          exam: WrittenExam;
          answers: string[];
          graded: GradedExam | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          material_id: string;
          created_at?: string;
          exam: WrittenExam;
          answers: string[];
          graded?: GradedExam | null;
        };
        Update: Partial<Database["public"]["Tables"]["written_exams"]["Insert"]>;
        Relationships: [];
      };
      oral_sessions: {
        Row: {
          id: string;
          user_id: string;
          material_id: string;
          created_at: string;
          questions: string[];
          results: { question: string; transcript: string; grade: OralGrade }[];
        };
        Insert: {
          id?: string;
          user_id?: string;
          material_id: string;
          created_at?: string;
          questions: string[];
          results?: { question: string; transcript: string; grade: OralGrade }[];
        };
        Update: Partial<Database["public"]["Tables"]["oral_sessions"]["Insert"]>;
        Relationships: [];
      };
      lessons: {
        Row: { id: string; user_id: string; material_id: string; created_at: string; lesson: Lesson };
        Insert: { id?: string; user_id?: string; material_id: string; created_at?: string; lesson: Lesson };
        Update: Partial<Database["public"]["Tables"]["lessons"]["Insert"]>;
        Relationships: [];
      };
      podcasts: {
        Row: { id: string; user_id: string; material_id: string; created_at: string; podcast: PodcastScript };
        Insert: {
          id?: string;
          user_id?: string;
          material_id: string;
          created_at?: string;
          podcast: PodcastScript;
        };
        Update: Partial<Database["public"]["Tables"]["podcasts"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
