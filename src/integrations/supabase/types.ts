export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      advisor_notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          member_id: string
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          member_id: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          member_id?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          config_key: string
          config_value: Json
          description: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value?: Json
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      budget_targets: {
        Row: {
          budget_amount: number
          category: string
          company_id: string
          created_at: string
          id: string
          period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_amount?: number
          category: string
          company_id: string
          created_at?: string
          id?: string
          period?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_amount?: number
          category?: string
          company_id?: string
          created_at?: string
          id?: string
          period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_activity: {
        Row: {
          activity_at: string
          activity_type: string
          circle_member_id: number
          circle_post_id: number | null
          content_preview: string | null
          created_at: string
          id: string
          space_name: string | null
          synced_at: string
          title: string | null
        }
        Insert: {
          activity_at: string
          activity_type: string
          circle_member_id: number
          circle_post_id?: number | null
          content_preview?: string | null
          created_at?: string
          id?: string
          space_name?: string | null
          synced_at?: string
          title?: string | null
        }
        Update: {
          activity_at?: string
          activity_type?: string
          circle_member_id?: number
          circle_post_id?: number | null
          content_preview?: string | null
          created_at?: string
          id?: string
          space_name?: string | null
          synced_at?: string
          title?: string | null
        }
        Relationships: []
      }
      circle_course_progress: {
        Row: {
          circle_member_id: number
          completed_at: string | null
          course_id: number
          course_name: string
          created_at: string
          id: string
          lessons_completed: number
          lessons_total: number
          synced_at: string
          updated_at: string
        }
        Insert: {
          circle_member_id: number
          completed_at?: string | null
          course_id: number
          course_name?: string
          created_at?: string
          id?: string
          lessons_completed?: number
          lessons_total?: number
          synced_at?: string
          updated_at?: string
        }
        Update: {
          circle_member_id?: number
          completed_at?: string | null
          course_id?: number
          course_name?: string
          created_at?: string
          id?: string
          lessons_completed?: number
          lessons_total?: number
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      circle_members: {
        Row: {
          avatar_url: string | null
          bio: string | null
          circle_created_at: string | null
          circle_id: number
          created_at: string
          email: string
          headline: string | null
          id: string
          last_seen_at: string | null
          name: string
          space_ids: Json | null
          synced_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          circle_created_at?: string | null
          circle_id: number
          created_at?: string
          email: string
          headline?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          space_ids?: Json | null
          synced_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          circle_created_at?: string | null
          circle_id?: number
          created_at?: string
          email?: string
          headline?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          space_ids?: Json | null
          synced_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          annual_revenue: number | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          cvr_number: string | null
          end_date: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          postal_code: string | null
          slack_channel: string | null
          start_date: string | null
          status: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          annual_revenue?: number | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          cvr_number?: string | null
          end_date?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          postal_code?: string | null
          slack_channel?: string | null
          start_date?: string | null
          status?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          annual_revenue?: number | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          cvr_number?: string | null
          end_date?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          postal_code?: string | null
          slack_channel?: string | null
          start_date?: string | null
          status?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          invited_by: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          id?: string
          invited_by: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          member_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          member_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          ai_analysis: Json | null
          company_id: string
          company_name: string | null
          cvr_number: string | null
          extracted_data: Json | null
          file_name: string
          file_path: string
          id: string
          processed_at: string | null
          report_period: string | null
          report_type: string
          status: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          company_id: string
          company_name?: string | null
          cvr_number?: string | null
          extracted_data?: Json | null
          file_name: string
          file_path: string
          id?: string
          processed_at?: string | null
          report_period?: string | null
          report_type: string
          status?: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          company_id?: string
          company_name?: string | null
          cvr_number?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_path?: string
          id?: string
          processed_at?: string | null
          report_period?: string | null
          report_type?: string
          status?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      handout_lever_milestones: {
        Row: {
          created_at: string
          handout_id: string
          id: string
          lever_index: number
          milestone_id: string
        }
        Insert: {
          created_at?: string
          handout_id: string
          id?: string
          lever_index: number
          milestone_id: string
        }
        Update: {
          created_at?: string
          handout_id?: string
          id?: string
          lever_index?: number
          milestone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handout_lever_milestones_handout_id_fkey"
            columns: ["handout_id"]
            isOneToOne: false
            referencedRelation: "handouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handout_lever_milestones_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      handouts: {
        Row: {
          ai_feedback: Json | null
          ai_feedback_at: string | null
          checklist: Json
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          levers: Json
          module: string
          responses: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_feedback?: Json | null
          ai_feedback_at?: string | null
          checklist?: Json
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          levers?: Json
          module: string
          responses?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_feedback?: Json | null
          ai_feedback_at?: string | null
          checklist?: Json
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          levers?: Json
          module?: string
          responses?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_benchmarks: {
        Row: {
          benchmark_label: string
          benchmark_value: number
          company_id: string
          created_at: string
          id: string
          kpi_key: string
          source_label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          benchmark_label?: string
          benchmark_value: number
          company_id: string
          created_at?: string
          id?: string
          kpi_key: string
          source_label?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          benchmark_label?: string
          benchmark_value?: number
          company_id?: string
          created_at?: string
          id?: string
          kpi_key?: string
          source_label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_benchmarks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_targets: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kpi_key: string
          lower_is_better: boolean
          target_label: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kpi_key: string
          lower_is_better?: boolean
          target_label?: string
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kpi_key?: string
          lower_is_better?: boolean
          target_label?: string
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          context_id: string | null
          context_meta: Json | null
          context_type: string | null
          conversation_id: string
          created_at: string
          id: string
          message_type: string
          pinned_at: string | null
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          context_id?: string | null
          context_meta?: Json | null
          context_type?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          message_type?: string
          pinned_at?: string | null
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          context_id?: string | null
          context_meta?: Json | null
          context_type?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          message_type?: string
          pinned_at?: string | null
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          baseline: string | null
          category: string
          company_id: string
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          progress: number
          source: string
          source_report: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline?: string | null
          category?: string
          company_id: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          source?: string
          source_report?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline?: string | null
          category?: string
          company_id?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          source?: string
          source_report?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_company_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "member" | "advisor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["member", "advisor"],
    },
  },
} as const
