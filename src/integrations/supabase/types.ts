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
      _facts_backfill_log: {
        Row: {
          company_id: string | null
          created_at: string
          detail: string | null
          id: string
          period_key: string | null
          report_id: string
          result: string
          run_at: string
          source_type: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          period_key?: string | null
          report_id: string
          result: string
          run_at?: string
          source_type?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          period_key?: string | null
          report_id?: string
          result?: string
          run_at?: string
          source_type?: string | null
        }
        Relationships: []
      }
      advisor_financial_actions: {
        Row: {
          actioned_at: string
          actioned_by_advisor_id: string
          id: string
          note: string | null
          notification_id: string
          snoozed_until: string
        }
        Insert: {
          actioned_at?: string
          actioned_by_advisor_id: string
          id?: string
          note?: string | null
          notification_id: string
          snoozed_until: string
        }
        Update: {
          actioned_at?: string
          actioned_by_advisor_id?: string
          id?: string
          note?: string | null
          notification_id?: string
          snoozed_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_financial_actions_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
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
      advisor_milestone_actions: {
        Row: {
          actioned_at: string
          actioned_by_advisor_id: string | null
          advisor_id: string
          id: string
          milestone_id: string
          note: string | null
          snoozed_until: string
        }
        Insert: {
          actioned_at?: string
          actioned_by_advisor_id?: string | null
          advisor_id: string
          id?: string
          milestone_id: string
          note?: string | null
          snoozed_until: string
        }
        Update: {
          actioned_at?: string
          actioned_by_advisor_id?: string | null
          advisor_id?: string
          id?: string
          milestone_id?: string
          note?: string | null
          snoozed_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_milestone_actions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: true
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_notifications: {
        Row: {
          advisor_id: string | null
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
          advisor_id?: string | null
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
          advisor_id?: string | null
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
      advisor_session_notes: {
        Row: {
          company_id: string
          created_at: string
          generated_at: string
          generated_by: string
          id: string
          note_text: string
        }
        Insert: {
          company_id: string
          created_at?: string
          generated_at?: string
          generated_by: string
          id?: string
          note_text?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          generated_at?: string
          generated_by?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_session_notes_company_id_fkey"
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
      budget_category_group_map: {
        Row: {
          category_key: string
          group_key: string
          template_key: string
        }
        Insert: {
          category_key: string
          group_key: string
          template_key: string
        }
        Update: {
          category_key?: string
          group_key?: string
          template_key?: string
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
      circle_oauth_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      circle_oauth_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
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
          industry_code: string | null
          industry_label: string | null
          is_demo: boolean | null
          is_legat: boolean
          logo_url: string | null
          name: string
          postal_code: string | null
          slack_channel: string | null
          start_date: string | null
          status: string | null
          website: string | null
          weekly_focus_enabled: boolean
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
          industry_code?: string | null
          industry_label?: string | null
          is_demo?: boolean | null
          is_legat?: boolean
          logo_url?: string | null
          name?: string
          postal_code?: string | null
          slack_channel?: string | null
          start_date?: string | null
          status?: string | null
          website?: string | null
          weekly_focus_enabled?: boolean
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
          industry_code?: string | null
          industry_label?: string | null
          is_demo?: boolean | null
          is_legat?: boolean
          logo_url?: string | null
          name?: string
          postal_code?: string | null
          slack_channel?: string | null
          start_date?: string | null
          status?: string | null
          website?: string | null
          weekly_focus_enabled?: boolean
        }
        Relationships: []
      }
      company_actions: {
        Row: {
          company_id: string
          completed_at: string | null
          context: string | null
          created_at: string
          dismissed_at: string | null
          generated_at: string | null
          id: string
          priority: string
          source_id: string | null
          source_type: string
          status: string
          title: string
          updated_at: string
          user_id: string
          week_key: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          context?: string | null
          created_at?: string
          dismissed_at?: string | null
          generated_at?: string | null
          id?: string
          priority?: string
          source_id?: string | null
          source_type?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          week_key?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          context?: string | null
          created_at?: string
          dismissed_at?: string | null
          generated_at?: string | null
          id?: string
          priority?: string
          source_id?: string | null
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          week_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      conversation_last_seen: {
        Row: {
          conversation_id: string
          conversation_type: string
          id: string
          last_seen_at: string
          last_seen_message_id: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          conversation_type?: string
          id?: string
          last_seen_at?: string
          last_seen_message_id?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          conversation_type?: string
          id?: string
          last_seen_at?: string
          last_seen_message_id?: string | null
          user_id?: string
        }
        Relationships: []
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
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_log_legacy: {
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
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
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
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_note: string | null
          category: string
          company_id: string | null
          created_at: string
          description: string
          id: string
          resolved_at: string | null
          screenshot_path: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          category?: string
          company_id?: string | null
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          screenshot_path?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          category?: string
          company_id?: string | null
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          screenshot_path?: string | null
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
      financial_commentaries: {
        Row: {
          analysis: Json
          basis_committed_at: string
          basis_metrics_hash: string
          basis_source_type: string
          company_id: string
          created_at: string
          facts_id: string
          generated_at: string
          generated_by: string
          id: string
          is_stale: boolean
          period_key: string
        }
        Insert: {
          analysis: Json
          basis_committed_at: string
          basis_metrics_hash: string
          basis_source_type: string
          company_id: string
          created_at?: string
          facts_id: string
          generated_at?: string
          generated_by: string
          id?: string
          is_stale?: boolean
          period_key: string
        }
        Update: {
          analysis?: Json
          basis_committed_at?: string
          basis_metrics_hash?: string
          basis_source_type?: string
          company_id?: string
          created_at?: string
          facts_id?: string
          generated_at?: string
          generated_by?: string
          id?: string
          is_stale?: boolean
          period_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_commentaries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_commentaries_facts_id_fkey"
            columns: ["facts_id"]
            isOneToOne: false
            referencedRelation: "financial_report_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_report_facts: {
        Row: {
          committed_at: string
          committed_by: string | null
          company_id: string
          created_at: string
          id: string
          metrics: Json
          period_key: string
          period_label: string
          source_report_id: string
          source_type: string
        }
        Insert: {
          committed_at?: string
          committed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          metrics: Json
          period_key: string
          period_label: string
          source_report_id: string
          source_type: string
        }
        Update: {
          committed_at?: string
          committed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          metrics?: Json
          period_key?: string
          period_label?: string
          source_report_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_report_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_report_facts_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
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
          extraction_contract_version: string
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
          quality_signals: Json | null
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
          extraction_contract_version?: string
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
          quality_signals?: Json | null
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
          extraction_contract_version?: string
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
          quality_signals?: Json | null
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
      group_advisor_access: {
        Row: {
          advisor_user_id: string
          created_at: string
          group_id: string
          id: string
        }
        Insert: {
          advisor_user_id: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          advisor_user_id?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_advisor_access_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_companies: {
        Row: {
          company_id: string
          created_at: string
          group_id: string
          id: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          group_id: string
          id?: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          group_id?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_companies_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_conversations: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_advisor_id: string | null
          assigned_advisor_id: string | null
          awaiting_reply_from: string | null
          conversation_status: string
          created_at: string
          follow_up_at: string | null
          group_id: string
          id: string
          last_advisor_reply_at: string | null
          last_member_message_at: string | null
          last_message_at: string | null
          resolved_at: string | null
          resolved_by_advisor_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_advisor_id?: string | null
          assigned_advisor_id?: string | null
          awaiting_reply_from?: string | null
          conversation_status?: string
          created_at?: string
          follow_up_at?: string | null
          group_id: string
          id?: string
          last_advisor_reply_at?: string | null
          last_member_message_at?: string | null
          last_message_at?: string | null
          resolved_at?: string | null
          resolved_by_advisor_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_advisor_id?: string | null
          assigned_advisor_id?: string | null
          awaiting_reply_from?: string | null
          conversation_status?: string
          created_at?: string
          follow_up_at?: string | null
          group_id?: string
          id?: string
          last_advisor_reply_at?: string | null
          last_member_message_at?: string | null
          last_message_at?: string | null
          resolved_at?: string | null
          resolved_by_advisor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      group_memberships: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role: string
          user_id: string
          welcome_dismissed_at: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role?: string
          user_id: string
          welcome_dismissed_at?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          role?: string
          user_id?: string
          welcome_dismissed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          context_meta: Json | null
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          message_type: string
          sender_id: string
        }
        Insert: {
          content: string
          context_meta?: Json | null
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          message_type?: string
          sender_id: string
        }
        Update: {
          content?: string
          context_meta?: Json | null
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          message_type?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "group_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          anchor_company_id: string
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          anchor_company_id: string
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          anchor_company_id?: string
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_anchor_company_id_fkey"
            columns: ["anchor_company_id"]
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
      industry_benchmarks: {
        Row: {
          benchmark_label: string
          benchmark_max: number
          benchmark_min: number
          benchmark_value: number
          created_at: string
          id: string
          industry_code: string
          industry_label: string
          kpi_key: string
          source_label: string
          updated_at: string
        }
        Insert: {
          benchmark_label: string
          benchmark_max: number
          benchmark_min: number
          benchmark_value: number
          created_at?: string
          id?: string
          industry_code: string
          industry_label: string
          kpi_key: string
          source_label?: string
          updated_at?: string
        }
        Update: {
          benchmark_label?: string
          benchmark_max?: number
          benchmark_min?: number
          benchmark_value?: number
          created_at?: string
          id?: string
          industry_code?: string
          industry_label?: string
          kpi_key?: string
          source_label?: string
          updated_at?: string
        }
        Relationships: []
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
      kpi_chart_comments: {
        Row: {
          author_id: string
          company_id: string
          content: string
          created_at: string
          id: string
          kpi_key: string
          period_key: string
          period_label: string
          updated_at: string
        }
        Insert: {
          author_id: string
          company_id: string
          content: string
          created_at?: string
          id?: string
          kpi_key: string
          period_key: string
          period_label: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          kpi_key?: string
          period_key?: string
          period_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_chart_comments_company_id_fkey"
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
      legat_enrollments: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          momentumkald_booked: boolean
          notes: string | null
          start_date: string
          status: string
          upgraded_at: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          momentumkald_booked?: boolean
          notes?: string | null
          start_date?: string
          status?: string
          upgraded_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          momentumkald_booked?: boolean
          notes?: string | null
          start_date?: string
          status?: string
          upgraded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legat_enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          message_table: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          message_table: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          message_table?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          context_id: string | null
          context_meta: Json | null
          context_type: string | null
          conversation_id: string
          created_at: string
          edited_at: string | null
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
          edited_at?: string | null
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
          edited_at?: string | null
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
          current_value: number | null
          deadline: string | null
          description: string | null
          id: string
          progress: number
          progress_updated_at: string | null
          source: string
          source_report: string | null
          status: string
          target_value: number | null
          title: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline?: string | null
          category?: string
          company_id: string
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          progress_updated_at?: string | null
          source?: string
          source_report?: string | null
          status?: string
          target_value?: number | null
          title: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline?: string | null
          category?: string
          company_id?: string
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          id?: string
          progress?: number
          progress_updated_at?: string | null
          source?: string
          source_report?: string | null
          status?: string
          target_value?: number | null
          title?: string
          unit?: string | null
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
      notifications: {
        Row: {
          body: string | null
          company_id: string | null
          created_at: string
          dedup_key: string
          deep_link: string | null
          email_sent_at: string | null
          group_id: string | null
          id: string
          priority: string
          push_sent_at: string | null
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          seen_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          dedup_key: string
          deep_link?: string | null
          email_sent_at?: string | null
          group_id?: string | null
          id?: string
          priority?: string
          push_sent_at?: string | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          seen_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          dedup_key?: string
          deep_link?: string | null
          email_sent_at?: string | null
          group_id?: string | null
          id?: string
          priority?: string
          push_sent_at?: string | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          seen_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notification_email_prefs: Json | null
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
          notification_email_prefs?: Json | null
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
          notification_email_prefs?: Json | null
          onboarded_at?: string | null
          tour_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pulse_checkins: {
        Row: {
          biggest_challenge: string | null
          company_id: string
          created_at: string
          help_needed: string | null
          id: string
          milestone_progress: number | null
          period_key: string
          user_id: string
          went_well: string | null
        }
        Insert: {
          biggest_challenge?: string | null
          company_id: string
          created_at?: string
          help_needed?: string | null
          id?: string
          milestone_progress?: number | null
          period_key: string
          user_id: string
          went_well?: string | null
        }
        Update: {
          biggest_challenge?: string | null
          company_id?: string
          created_at?: string
          help_needed?: string | null
          id?: string
          milestone_progress?: number | null
          period_key?: string
          user_id?: string
          went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pulse_checkins_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      session_bookings: {
        Row: {
          amount_dkk: number
          calendly_booking_url: string | null
          calendly_event_uri: string | null
          company_id: string | null
          created_at: string
          id: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_dkk: number
          calendly_booking_url?: string | null
          calendly_event_uri?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_dkk?: number
          calendly_booking_url?: string | null
          calendly_event_uri?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      weekly_focus: {
        Row: {
          actions_generated: number
          company_id: string
          created_at: string
          data_freshness_days: number | null
          expires_at: string
          generated_at: string
          headline: string | null
          id: string
          seen_at: string | null
          status: string
          summary: string | null
          trigger_data: Json
          triggers_fired: Json
          week_key: string
        }
        Insert: {
          actions_generated?: number
          company_id: string
          created_at?: string
          data_freshness_days?: number | null
          expires_at?: string
          generated_at?: string
          headline?: string | null
          id?: string
          seen_at?: string | null
          status?: string
          summary?: string | null
          trigger_data?: Json
          triggers_fired?: Json
          week_key: string
        }
        Update: {
          actions_generated?: number
          company_id?: string
          created_at?: string
          data_freshness_days?: number | null
          expires_at?: string
          generated_at?: string
          headline?: string | null
          id?: string
          seen_at?: string | null
          status?: string
          summary?: string | null
          trigger_data?: Json
          triggers_fired?: Json
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_focus_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_company_to_group: {
        Args: {
          _caller_id: string
          _company_id: string
          _group_id: string
          _member_entries?: Json
        }
        Returns: Json
      }
      admin_create_group: {
        Args: {
          _advisor_ids: string[]
          _anchor_company_id: string
          _caller_id: string
          _company_ids: string[]
          _group_name: string
          _member_entries: Json
        }
        Returns: Json
      }
      advisor_has_group_access: {
        Args: { _advisor_id: string; _group_id: string }
        Returns: boolean
      }
      cleanup_stale_processing_reports: { Args: never; Returns: number }
      commit_report_facts: {
        Args: { p_report_id: string }
        Returns: {
          committed_at: string
          committed_by: string | null
          company_id: string
          created_at: string
          id: string
          metrics: Json
          period_key: string
          period_label: string
          source_report_id: string
          source_type: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_report_facts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_facts_metrics_hash: { Args: { _metrics: Json }; Returns: string }
      create_group: {
        Args: { _caller_id: string; _companies: Json; _group_name: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_admin_group_list: {
        Args: never
        Returns: {
          anchor_company_id: string
          anchor_company_name: string
          company_count: number
          created_at: string
          group_id: string
          group_name: string
          member_count: number
        }[]
      }
      get_all_advisor_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          user_id: string
        }[]
      }
      get_conversation_sender_profiles: {
        Args: { _conversation_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          is_advisor: boolean
          user_id: string
        }[]
      }
      get_group_financial_summary_for_admin: {
        Args: { p_group_id: string }
        Returns: {
          cash: number
          company_id: string
          company_name: string
          ebt: number
          effective_period_key: string
          effective_period_label: string
          gross_profit: number
          has_report: boolean
          has_verified_metrics: boolean
          latest_report_id: string
          logo_url: string
          missing_current_period: boolean
          revenue: number
        }[]
      }
      get_group_financial_summary_for_advisor: {
        Args: { p_group_id: string }
        Returns: {
          cash: number
          company_id: string
          company_name: string
          ebt: number
          effective_period_key: string
          effective_period_label: string
          gross_profit: number
          has_report: boolean
          has_verified_metrics: boolean
          latest_report_id: string
          logo_url: string
          missing_current_period: boolean
          revenue: number
          revenue_prev: number
        }[]
      }
      get_my_group_budget_summary: { Args: { p_year: string }; Returns: Json }
      get_my_group_financial_summary: {
        Args: never
        Returns: {
          cash: number
          company_id: string
          company_name: string
          ebt: number
          effective_period_key: string
          effective_period_label: string
          gross_profit: number
          has_report: boolean
          has_verified_metrics: boolean
          latest_report_id: string
          logo_url: string
          missing_current_period: boolean
          revenue: number
          revenue_prev: number
        }[]
      }
      get_report_commit_preview: {
        Args: { p_report_id: string }
        Returns: Json
      }
      get_report_commit_states: {
        Args: { p_company_id: string }
        Returns: {
          can_commit: boolean
          eligible: boolean
          extraction_contract_version: string
          ownership_state: string
          period_key: string
          report_id: string
          state: string
          state_reason: string
          validation_status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_subcompany: { Args: { p_company_id: string }; Returns: boolean }
      is_legat_user: { Args: { _user_id: string }; Returns: boolean }
      legat_day: { Args: { _user_id: string }; Returns: number }
      legat_unlocked_modules: { Args: { _user_id: string }; Returns: string[] }
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
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      mark_notifications_seen: { Args: never; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      owner_add_company_to_group: {
        Args: { _company_name: string; _cvr_number?: string; _group_id: string }
        Returns: Json
      }
      parse_dk_report_period_key: { Args: { _period: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      resolve_report_commit_candidate: {
        Args: { p_report_id: string }
        Returns: Database["public"]["CompositeTypes"]["report_commit_candidate"]
        SetofOptions: {
          from: "*"
          to: "report_commit_candidate"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_can_access_group_conversation: {
        Args: { _conv_id: string }
        Returns: boolean
      }
      user_company_id: { Args: { _user_id: string }; Returns: string }
      user_group_id: { Args: { _user_id: string }; Returns: string }
      user_has_group_feature: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "member" | "advisor" | "admin"
    }
    CompositeTypes: {
      report_commit_candidate: {
        report_id: string | null
        company_id: string | null
        eligible: boolean | null
        eligibility_reason: string | null
        source_type: string | null
        period_key: string | null
        period_label: string | null
        report_type: string | null
        validation_status: string | null
        metrics_preview: Json | null
        ownership_state: string | null
        existing_owner_id: string | null
        can_commit: boolean | null
        state: string | null
        state_reason: string | null
      }
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
