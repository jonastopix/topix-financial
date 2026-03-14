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
      advisor_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          status?: string
        }
        Relationships: []
      }
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
          accepted_by: string | null
          company_id: string | null
          created_at: string
          email: string
          id: string
          invited_by: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id?: string | null
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
      conversation_notes: {
        Row: {
          content: string
          conversation_id: string
          id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          content?: string
          conversation_id: string
          id?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          content?: string
          conversation_id?: string
          id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_advisor_id: string | null
          assigned_advisor_id: string | null
          awaiting_reply_from: string | null
          company_id: string | null
          conversation_status: string
          created_at: string
          follow_up_at: string | null
          id: string
          last_advisor_reply_at: string | null
          last_member_message_at: string | null
          last_message_at: string | null
          member_id: string
          resolved_at: string | null
          resolved_by_advisor_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_advisor_id?: string | null
          assigned_advisor_id?: string | null
          awaiting_reply_from?: string | null
          company_id?: string | null
          conversation_status?: string
          created_at?: string
          follow_up_at?: string | null
          id?: string
          last_advisor_reply_at?: string | null
          last_member_message_at?: string | null
          last_message_at?: string | null
          member_id: string
          resolved_at?: string | null
          resolved_by_advisor_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_advisor_id?: string | null
          assigned_advisor_id?: string | null
          awaiting_reply_from?: string | null
          company_id?: string | null
          conversation_status?: string
          created_at?: string
          follow_up_at?: string | null
          id?: string
          last_advisor_reply_at?: string | null
          last_member_message_at?: string | null
          last_message_at?: string | null
          member_id?: string
          resolved_at?: string | null
          resolved_by_advisor_id?: string | null
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
      email_send_log: {
        Row: {
          error_message: string | null
          id: string
          is_test: boolean
          recipient_email: string
          sent_at: string
          status: string
          subject: string
          template_id: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          is_test?: boolean
          recipient_email: string
          sent_at?: string
          status?: string
          subject: string
          template_id: string
        }
        Update: {
          error_message?: string | null
          id?: string
          is_test?: boolean
          recipient_email?: string
          sent_at?: string
          status?: string
          subject?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          enabled: boolean
          id: string
          name: string
          sender_email: string
          sender_name: string
          subject: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          body_html?: string
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          sender_email?: string
          sender_name?: string
          subject?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          body_html?: string
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          sender_email?: string
          sender_name?: string
          subject?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_note: string | null
          category: string
          company_id: string
          created_at: string
          description: string
          id: string
          resolved_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          category?: string
          company_id: string
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          category?: string
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_company_id_fkey"
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
          deleted_at: string | null
          extracted_data: Json | null
          extraction_method: string | null
          file_name: string
          file_path: string
          id: string
          manual_normalized_data: Json | null
          manual_override_at: string | null
          manual_override_by: string | null
          manual_override_note: string | null
          manual_override_source: string | null
          manual_override_status: string | null
          manual_report_period_key: string | null
          manual_report_period_label: string | null
          manual_report_type: string | null
          normalized_data: Json | null
          processed_at: string | null
          raw_extracted_data: Json | null
          report_period: string | null
          report_type: string
          reviewed_at: string | null
          status: string
          uploaded_at: string
          user_id: string
          validation_errors: string[] | null
          validation_status: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          company_id: string
          company_name?: string | null
          cvr_number?: string | null
          deleted_at?: string | null
          extracted_data?: Json | null
          extraction_method?: string | null
          file_name: string
          file_path: string
          id?: string
          manual_normalized_data?: Json | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_note?: string | null
          manual_override_source?: string | null
          manual_override_status?: string | null
          manual_report_period_key?: string | null
          manual_report_period_label?: string | null
          manual_report_type?: string | null
          normalized_data?: Json | null
          processed_at?: string | null
          raw_extracted_data?: Json | null
          report_period?: string | null
          report_type: string
          reviewed_at?: string | null
          status?: string
          uploaded_at?: string
          user_id: string
          validation_errors?: string[] | null
          validation_status?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          company_id?: string
          company_name?: string | null
          cvr_number?: string | null
          deleted_at?: string | null
          extracted_data?: Json | null
          extraction_method?: string | null
          file_name?: string
          file_path?: string
          id?: string
          manual_normalized_data?: Json | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_note?: string | null
          manual_override_source?: string | null
          manual_override_status?: string | null
          manual_report_period_key?: string | null
          manual_report_period_label?: string | null
          manual_report_type?: string | null
          normalized_data?: Json | null
          processed_at?: string | null
          raw_extracted_data?: Json | null
          report_period?: string | null
          report_type?: string
          reviewed_at?: string | null
          status?: string
          uploaded_at?: string
          user_id?: string
          validation_errors?: string[] | null
          validation_status?: string | null
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
          email: string | null
          full_name: string
          id: string
          onboarded_at: string | null
          tour_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          onboarded_at?: string | null
          tour_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          onboarded_at?: string | null
          tour_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      slack_conversation_threads: {
        Row: {
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          slack_channel_id: string
          slack_thread_ts: string | null
          status: string
        }
        Insert: {
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          slack_channel_id: string
          slack_thread_ts?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          slack_channel_id?: string
          slack_thread_ts?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_conversation_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_conversation_threads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_handout_notification_log: {
        Row: {
          company_id: string
          completed_at: string
          created_at: string
          handout_id: string
          id: string
          slack_channel_id: string
          slack_ts: string | null
        }
        Insert: {
          company_id: string
          completed_at: string
          created_at?: string
          handout_id: string
          id?: string
          slack_channel_id: string
          slack_ts?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string
          created_at?: string
          handout_id?: string
          id?: string
          slack_channel_id?: string
          slack_ts?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_handout_notification_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_handout_notification_log_handout_id_fkey"
            columns: ["handout_id"]
            isOneToOne: false
            referencedRelation: "handouts"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_notification_log: {
        Row: {
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          notification_type: string
          slack_channel_id: string
          slack_thread_ts: string | null
          slack_ts: string | null
        }
        Insert: {
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          notification_type?: string
          slack_channel_id: string
          slack_thread_ts?: string | null
          slack_ts?: string | null
        }
        Update: {
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          notification_type?: string
          slack_channel_id?: string
          slack_thread_ts?: string | null
          slack_ts?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_notification_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_notification_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_notification_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_report_notification_log: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message_id: string
          report_id: string
          slack_channel_id: string
          slack_ts: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message_id: string
          report_id: string
          slack_channel_id: string
          slack_ts?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message_id?: string
          report_id?: string
          slack_channel_id?: string
          slack_ts?: string | null
        }
        Relationships: []
      }
      user_login_log: {
        Row: {
          id: string
          ip_address: string | null
          logged_in_at: string
          user_id: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          logged_in_at?: string
          user_id: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          logged_in_at?: string
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
      cleanup_stale_processing_reports: { Args: never; Returns: number }
      get_conversation_sender_profiles: {
        Args: { _conversation_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          is_advisor: boolean
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_user_login: { Args: never; Returns: undefined }
      lookup_invite_company: { Args: { invite_token: string }; Returns: string }
      lookup_invite_company_info: {
        Args: { invite_token: string }
        Returns: Json
      }
      mark_messages_read: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      user_company_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "member" | "advisor" | "admin"
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
      app_role: ["member", "advisor", "admin"],
    },
  },
} as const
