export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          changed_at: string;
          changed_by: string | null;
          diff: NonNullable<Json>;
          id: number;
          record_id: string | null;
          table_name: string;
        };
        Insert: {
          action: string;
          changed_at?: string;
          changed_by?: string | null;
          diff: NonNullable<Json>;
          id?: never;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          changed_at?: string;
          changed_by?: string | null;
          diff?: NonNullable<Json>;
          id?: never;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      case_status_history: {
        Row: {
          case_id: string;
          changed_at: string;
          changed_by: string | null;
          from_status: string | null;
          id: string;
          note: string | null;
          to_status: string;
        };
        Insert: {
          case_id: string;
          changed_at?: string;
          changed_by?: string | null;
          from_status?: string | null;
          id?: string;
          note?: string | null;
          to_status: string;
        };
        Update: {
          case_id?: string;
          changed_at?: string;
          changed_by?: string | null;
          from_status?: string | null;
          id?: string;
          note?: string | null;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_status_history_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "case_status_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cases: {
        Row: {
          act: string;
          amount_recovered: number | null;
          assigned_officer_id: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          file_number: string;
          forwarded_to: string | null;
          id: string;
          memo_number: string | null;
          next_hearing_date: string | null;
          office_code: string;
          received_date: string;
          received_from_id: string | null;
          section_id: string | null;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          act: string;
          amount_recovered?: number | null;
          assigned_officer_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          file_number: string;
          forwarded_to?: string | null;
          id?: string;
          memo_number?: string | null;
          next_hearing_date?: string | null;
          office_code?: string;
          received_date: string;
          received_from_id?: string | null;
          section_id?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Update: {
          act?: string;
          amount_recovered?: number | null;
          assigned_officer_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          file_number?: string;
          forwarded_to?: string | null;
          id?: string;
          memo_number?: string | null;
          next_hearing_date?: string | null;
          office_code?: string;
          received_date?: string;
          received_from_id?: string | null;
          section_id?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cases_assigned_officer_id_fkey";
            columns: ["assigned_officer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cases_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cases_received_from_id_fkey";
            columns: ["received_from_id"];
            isOneToOne: false;
            referencedRelation: "received_from";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cases_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
        ];
      };
      hearings: {
        Row: {
          case_id: string;
          created_at: string;
          created_by: string | null;
          hearing_date: string;
          hearing_time: string | null;
          id: string;
          outcome_notes: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          created_by?: string | null;
          hearing_date: string;
          hearing_time?: string | null;
          id?: string;
          outcome_notes?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          created_by?: string | null;
          hearing_date?: string;
          hearing_time?: string | null;
          id?: string;
          outcome_notes?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hearings_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hearings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      parties: {
        Row: {
          address: string | null;
          case_id: string;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          phone: string[];
          preferred_language: string | null;
          role: string;
          updated_at: string;
          whatsapp_phone: string | null;
        };
        Insert: {
          address?: string | null;
          case_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          phone?: string[];
          preferred_language?: string | null;
          role: string;
          updated_at?: string;
          whatsapp_phone?: string | null;
        };
        Update: {
          address?: string | null;
          case_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          phone?: string[];
          preferred_language?: string | null;
          role?: string;
          updated_at?: string;
          whatsapp_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "parties_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      received_from: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      remarks: {
        Row: {
          case_id: string;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          text: string;
          url: string | null;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          text: string;
          url?: string | null;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          text?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "remarks_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "remarks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sections: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_access_case: { Args: { p_case_id: string }; Returns: boolean };
      is_active_user: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      refresh_next_hearing: { Args: { p_case_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
