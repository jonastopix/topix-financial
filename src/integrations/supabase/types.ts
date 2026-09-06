export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      _facts_backfill_log: {
        Row: {
          id: string
          run_at: string
          report_id: string
          company_id?: string
          period_key?: string
          source_type?: string
          result: string
          detail?: string
          created_at: string
        }
        Insert: {
          id?: string
          run_at?: string
          report_id: string
          company_id?: string
          period_key?: string
          source_type?: string
          result: string
          detail?: string
          created_at?: string
        }
        Update: {
          id?: string
          run_at?: string
          report_id?: string
          company_id?: string
          period_key?: string
          source_type?: string
          result?: string
          detail?: string
          created_at?: string
        }
        Relationships: []
      }
      advisor_company_acknowledgments: {
        Row: {
          id: string
          advisor_id: string
          company_id: string
          acknowledged_at: string
          snoozed_until?: string
          basis_at: string
          note?: string
          created_at: string
        }
        Insert: {
          id?: string
          advisor_id: string
          company_id: string
          acknowledged_at?: string
          snoozed_until?: string
          basis_at: string
          note?: string
          created_at?: string
        }
        Update: {
          id?: string
          advisor_id?: string
          company_id?: string
          acknowledged_at?: string
          snoozed_until?: string
          basis_at?: string
          note?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_id"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_financial_actions: {
        Row: {
          id: string
          notification_id: string
          actioned_by_advisor_id: string
          actioned_at: string
          snoozed_until: string
          note?: string
        }
        Insert: {
          id?: string
          notification_id: string
          actioned_by_advisor_id: string
          actioned_at?: string
          snoozed_until: string
          note?: string
        }
        Update: {
          id?: string
          notification_id?: string
          actioned_by_advisor_id?: string
          actioned_at?: string
          snoozed_until?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "actioned_by_advisor_id"
            columns: ["actioned_by_advisor_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_id"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_invitations: {
        Row: {
          id: string
          email: string
          invited_by: string
          status: string
          accepted_at?: string
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          invited_by: string
          status?: string
          accepted_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          invited_by?: string
          status?: string
          accepted_at?: string
          created_at?: string
        }
        Relationships: []
      }
      advisor_milestone_actions: {
        Row: {
          id: string
          milestone_id: string
          advisor_id: string
          actioned_at: string
          snoozed_until: string
          note?: string
          actioned_by_advisor_id?: string
        }
        Insert: {
          id?: string
          milestone_id: string
          advisor_id: string
          actioned_at?: string
          snoozed_until: string
          note?: string
          actioned_by_advisor_id?: string
        }
        Update: {
          id?: string
          milestone_id?: string
          advisor_id?: string
          actioned_at?: string
          snoozed_until?: string
          note?: string
          actioned_by_advisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actioned_by_advisor_id"
            columns: ["actioned_by_advisor_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisor_id"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_id"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_notifications: {
        Row: {
          id: string
          type: string
          title: string
          body?: string
          company_id: string
          member_id: string
          reference_id?: string
          reference_type?: string
          read_at?: string
          created_at: string
          advisor_id?: string
        }
        Insert: {
          id?: string
          type: string
          title: string
          body?: string
          company_id: string
          member_id: string
          reference_id?: string
          reference_type?: string
          read_at?: string
          created_at?: string
          advisor_id?: string
        }
        Update: {
          id?: string
          type?: string
          title?: string
          body?: string
          company_id?: string
          member_id?: string
          reference_id?: string
          reference_type?: string
          read_at?: string
          created_at?: string
          advisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_id"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_session_notes: {
        Row: {
          id: string
          company_id: string
          generated_by: string
          note_text: string
          generated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          generated_by: string
          note_text?: string
          generated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          generated_by?: string
          note_text?: string
          generated_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_proposals: {
        Row: {
          id: string
          run_id: string
          company_id: string
          position: number
          tool: string
          args: Json
          iteration: number
          proposed_at: string
          status: string
          edited_args?: Json
          decision_reason?: string
          decided_by?: string
          decided_at?: string
          applied_at?: string
          created_at: string
          decision_category?: string
        }
        Insert: {
          id?: string
          run_id: string
          company_id: string
          position: number
          tool: string
          args: Json
          iteration: number
          proposed_at: string
          status?: string
          edited_args?: Json
          decision_reason?: string
          decided_by?: string
          decided_at?: string
          applied_at?: string
          created_at?: string
          decision_category?: string
        }
        Update: {
          id?: string
          run_id?: string
          company_id?: string
          position?: number
          tool?: string
          args?: Json
          iteration?: number
          proposed_at?: string
          status?: string
          edited_args?: Json
          decision_reason?: string
          decided_by?: string
          decided_at?: string
          applied_at?: string
          created_at?: string
          decision_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decided_by"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_id"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          id: string
          company_id: string
          trigger: string
          period_key: string
          period_label?: string
          mode: string
          model: string
          deploy_stamp: string
          iterations: number
          stop_reason?: string
          produced_output: boolean
          error?: string
          reasoning?: Json
          proposals: Json
          started_at: string
          finished_at: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          trigger: string
          period_key: string
          period_label?: string
          mode: string
          model: string
          deploy_stamp: string
          iterations?: number
          stop_reason?: string
          produced_output?: boolean
          error?: string
          reasoning?: Json
          proposals?: Json
          started_at: string
          finished_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          trigger?: string
          period_key?: string
          period_label?: string
          mode?: string
          model?: string
          deploy_stamp?: string
          iterations?: number
          stop_reason?: string
          produced_output?: boolean
          error?: string
          reasoning?: Json
          proposals?: Json
          started_at?: string
          finished_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          id: string
          config_key: string
          config_value: Json
          description?: string
          updated_at: string
          updated_by?: string
        }
        Insert: {
          id?: string
          config_key: string
          config_value?: Json
          description?: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          id?: string
          config_key?: string
          config_value?: Json
          description?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_targets: {
        Row: {
          id: string
          user_id: string
          category: string
          budget_amount: number
          period: string
          created_at: string
          updated_at: string
          company_id: string
        }
        Insert: {
          id?: string
          user_id: string
          category: string
          budget_amount?: number
          period?: string
          created_at?: string
          updated_at?: string
          company_id: string
        }
        Update: {
          id?: string
          user_id?: string
          category?: string
          budget_amount?: number
          period?: string
          created_at?: string
          updated_at?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reaktioner: {
        Row: {
          traad_id?: string
          svar_id?: string
          bruger_id: string
          type: string
          created_at: string
        }
        Insert: {
          traad_id?: string
          svar_id?: string
          bruger_id: string
          type?: string
          created_at?: string
        }
        Update: {
          traad_id?: string
          svar_id?: string
          bruger_id?: string
          type?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bruger_id"
            columns: ["bruger_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "svar_id"
            columns: ["svar_id"]
            isOneToOne: false
            referencedRelation: "community_svar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traad_id"
            columns: ["traad_id"]
            isOneToOne: false
            referencedRelation: "community_traade"
            referencedColumns: ["id"]
          },
        ]
      }
      community_svar: {
        Row: {
          id: string
          traad_id: string
          forfatter_id: string
          indhold: string
          status: string
          created_at: string
          updated_at: string
          indhold_json?: Json
        }
        Insert: {
          id?: string
          traad_id: string
          forfatter_id: string
          indhold: string
          status?: string
          created_at?: string
          updated_at?: string
          indhold_json?: Json
        }
        Update: {
          id?: string
          traad_id?: string
          forfatter_id?: string
          indhold?: string
          status?: string
          created_at?: string
          updated_at?: string
          indhold_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "forfatter_id"
            columns: ["forfatter_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traad_id"
            columns: ["traad_id"]
            isOneToOne: false
            referencedRelation: "community_traade"
            referencedColumns: ["id"]
          },
        ]
      }
      community_traade: {
        Row: {
          id: string
          forfatter_id: string
          titel: string
          indhold: string
          kilde_type?: string
          kilde_item_id?: string
          kilde_event_id?: string
          status: string
          fastgjort: boolean
          antal_svar: number
          antal_visninger: number
          sidste_svar_at?: string
          created_at: string
          updated_at: string
          indhold_json?: Json
        }
        Insert: {
          id?: string
          forfatter_id: string
          titel: string
          indhold: string
          kilde_type?: string
          kilde_item_id?: string
          kilde_event_id?: string
          status?: string
          fastgjort?: boolean
          antal_svar?: number
          antal_visninger?: number
          sidste_svar_at?: string
          created_at?: string
          updated_at?: string
          indhold_json?: Json
        }
        Update: {
          id?: string
          forfatter_id?: string
          titel?: string
          indhold?: string
          kilde_type?: string
          kilde_item_id?: string
          kilde_event_id?: string
          status?: string
          fastgjort?: boolean
          antal_svar?: number
          antal_visninger?: number
          sidste_svar_at?: string
          created_at?: string
          updated_at?: string
          indhold_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "forfatter_id"
            columns: ["forfatter_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kilde_event_id"
            columns: ["kilde_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kilde_item_id"
            columns: ["kilde_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      community_visninger: {
        Row: {
          traad_id: string
          bruger_id: string
          set_at: string
        }
        Insert: {
          traad_id: string
          bruger_id: string
          set_at?: string
        }
        Update: {
          traad_id?: string
          bruger_id?: string
          set_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bruger_id"
            columns: ["bruger_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traad_id"
            columns: ["traad_id"]
            isOneToOne: false
            referencedRelation: "community_traade"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          id: string
          name: string
          cvr_number?: string
          created_at: string
          industry?: string
          contact_person?: string
          contact_email?: string
          contact_phone?: string
          website?: string
          address?: string
          postal_code?: string
          city?: string
          annual_revenue?: number
          start_date?: string
          end_date?: string
          status?: string
          slack_channel?: string
          logo_url?: string
          industry_code?: string
          industry_label?: string
          weekly_focus_enabled: boolean
          is_demo?: boolean
          is_legat: boolean
          application_context?: Json
          onboarding_completed: boolean
          cvr_fetched_at?: string
          contract_start_date?: string
          contract_end_date?: string
          subscription_status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          subscription_current_period_end?: string
          offboarding_requested_at?: string
          intro_session_used_at?: string
          intro_reminder_last_sent_at?: string
          description?: string
          indgangspris_oere?: number
          fornyelsespris_oere?: number
          vis_i_netvaerk: boolean
          sidste_checkout_session_id?: string
          er_kunde: boolean
        }
        Insert: {
          id?: string
          name?: string
          cvr_number?: string
          created_at?: string
          industry?: string
          contact_person?: string
          contact_email?: string
          contact_phone?: string
          website?: string
          address?: string
          postal_code?: string
          city?: string
          annual_revenue?: number
          start_date?: string
          end_date?: string
          status?: string
          slack_channel?: string
          logo_url?: string
          industry_code?: string
          industry_label?: string
          weekly_focus_enabled?: boolean
          is_demo?: boolean
          is_legat?: boolean
          application_context?: Json
          onboarding_completed?: boolean
          cvr_fetched_at?: string
          contract_start_date?: string
          contract_end_date?: string
          subscription_status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          subscription_current_period_end?: string
          offboarding_requested_at?: string
          intro_session_used_at?: string
          intro_reminder_last_sent_at?: string
          description?: string
          indgangspris_oere?: number
          fornyelsespris_oere?: number
          vis_i_netvaerk?: boolean
          sidste_checkout_session_id?: string
          er_kunde?: boolean
        }
        Update: {
          id?: string
          name?: string
          cvr_number?: string
          created_at?: string
          industry?: string
          contact_person?: string
          contact_email?: string
          contact_phone?: string
          website?: string
          address?: string
          postal_code?: string
          city?: string
          annual_revenue?: number
          start_date?: string
          end_date?: string
          status?: string
          slack_channel?: string
          logo_url?: string
          industry_code?: string
          industry_label?: string
          weekly_focus_enabled?: boolean
          is_demo?: boolean
          is_legat?: boolean
          application_context?: Json
          onboarding_completed?: boolean
          cvr_fetched_at?: string
          contract_start_date?: string
          contract_end_date?: string
          subscription_status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          subscription_current_period_end?: string
          offboarding_requested_at?: string
          intro_session_used_at?: string
          intro_reminder_last_sent_at?: string
          description?: string
          indgangspris_oere?: number
          fornyelsespris_oere?: number
          vis_i_netvaerk?: boolean
          sidste_checkout_session_id?: string
          er_kunde?: boolean
        }
        Relationships: []
      }
      company_actions: {
        Row: {
          id: string
          company_id: string
          user_id: string
          title: string
          context?: string
          source_type: string
          source_id?: string
          priority: string
          status: string
          week_key?: string
          generated_at?: string
          completed_at?: string
          dismissed_at?: string
          created_at: string
          updated_at: string
          due_date?: string
          accepted_at?: string
          deferral_count: number
          expires_at?: string
          closed_at?: string
          proposed_by?: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          title: string
          context?: string
          source_type?: string
          source_id?: string
          priority?: string
          status?: string
          week_key?: string
          generated_at?: string
          completed_at?: string
          dismissed_at?: string
          created_at?: string
          updated_at?: string
          due_date?: string
          accepted_at?: string
          deferral_count?: number
          expires_at?: string
          closed_at?: string
          proposed_by?: string
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string
          title?: string
          context?: string
          source_type?: string
          source_id?: string
          priority?: string
          status?: string
          week_key?: string
          generated_at?: string
          completed_at?: string
          dismissed_at?: string
          created_at?: string
          updated_at?: string
          due_date?: string
          accepted_at?: string
          deferral_count?: number
          expires_at?: string
          closed_at?: string
          proposed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_by"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_betalingslink: {
        Row: {
          company_id: string
          prisniveau_oere?: number
          underskrevet_at: string
          token: string
          betalingsmail_sendt_at?: string
          sidste_paamindelse_dag?: number
          created_at: string
          updated_at: string
          sidste_checkout_session_id?: string
          monday_item_id?: number
          faktura_invoice_id?: string
          faktura_sendt_at?: string
        }
        Insert: {
          company_id: string
          prisniveau_oere?: number
          underskrevet_at?: string
          token?: string
          betalingsmail_sendt_at?: string
          sidste_paamindelse_dag?: number
          created_at?: string
          updated_at?: string
          sidste_checkout_session_id?: string
          monday_item_id?: number
          faktura_invoice_id?: string
          faktura_sendt_at?: string
        }
        Update: {
          company_id?: string
          prisniveau_oere?: number
          underskrevet_at?: string
          token?: string
          betalingsmail_sendt_at?: string
          sidste_paamindelse_dag?: number
          created_at?: string
          updated_at?: string
          sidste_checkout_session_id?: string
          monday_item_id?: number
          faktura_invoice_id?: string
          faktura_sendt_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_fornyelse: {
        Row: {
          company_id: string
          beslutning: string
          besluttet_af?: string
          besluttet_at: string
          note?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          company_id: string
          beslutning: string
          besluttet_af?: string
          besluttet_at?: string
          note?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          beslutning?: string
          besluttet_af?: string
          besluttet_at?: string
          note?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "besluttet_af"
            columns: ["besluttet_af"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invitations: {
        Row: {
          id: string
          company_id?: string
          email: string
          invited_by: string
          token: string
          status: string
          created_at: string
          accepted_at?: string
          accepted_by?: string
        }
        Insert: {
          id?: string
          company_id?: string
          email: string
          invited_by: string
          token?: string
          status?: string
          created_at?: string
          accepted_at?: string
          accepted_by?: string
        }
        Update: {
          id?: string
          company_id?: string
          email?: string
          invited_by?: string
          token?: string
          status?: string
          created_at?: string
          accepted_at?: string
          accepted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          id: string
          company_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_perioder: {
        Row: {
          id: string
          company_id: string
          periode_start: string
          periode_slut: string
          beloeb_oere: number
          betalingsmodel: string
          art: string
          stripe_reference?: string
          oprettet_af?: string
          note?: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          periode_start: string
          periode_slut: string
          beloeb_oere: number
          betalingsmodel: string
          art: string
          stripe_reference?: string
          oprettet_af?: string
          note?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          periode_start?: string
          periode_slut?: string
          beloeb_oere?: number
          betalingsmodel?: string
          art?: string
          stripe_reference?: string
          oprettet_af?: string
          note?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oprettet_af"
            columns: ["oprettet_af"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_traek: {
        Row: {
          id: string
          company_id: string
          stripe_subscription_id: string
          stripe_invoice_id: string
          stripe_customer_id?: string
          art?: string
          periode_start?: string
          periode_slut?: string
          beloeb_oere: number
          betalt_oere: number
          status: string
          betalt_at?: string
          fejlet_at?: string
          forsoeg?: number
          naeste_forsoeg_at?: string
          fejl_kode?: string
          fejl_decline_code?: string
          fejl_besked?: string
          billing_reason?: string
          faktura_nummer?: string
          hosted_invoice_url?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          stripe_subscription_id: string
          stripe_invoice_id: string
          stripe_customer_id?: string
          art?: string
          periode_start?: string
          periode_slut?: string
          beloeb_oere: number
          betalt_oere?: number
          status: string
          betalt_at?: string
          fejlet_at?: string
          forsoeg?: number
          naeste_forsoeg_at?: string
          fejl_kode?: string
          fejl_decline_code?: string
          fejl_besked?: string
          billing_reason?: string
          faktura_nummer?: string
          hosted_invoice_url?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          stripe_subscription_id?: string
          stripe_invoice_id?: string
          stripe_customer_id?: string
          art?: string
          periode_start?: string
          periode_slut?: string
          beloeb_oere?: number
          betalt_oere?: number
          status?: string
          betalt_at?: string
          fejlet_at?: string
          forsoeg?: number
          naeste_forsoeg_at?: string
          fejl_kode?: string
          fejl_decline_code?: string
          fejl_besked?: string
          billing_reason?: string
          faktura_nummer?: string
          hosted_invoice_url?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      content_collections: {
        Row: {
          id: string
          area: string
          parent_id?: string
          title: string
          slug: string
          description?: string
          cover_path?: string
          position: number
          drip_after_days?: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          area: string
          parent_id?: string
          title: string
          slug: string
          description?: string
          cover_path?: string
          position?: number
          drip_after_days?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          area?: string
          parent_id?: string
          title?: string
          slug?: string
          description?: string
          cover_path?: string
          position?: number
          drip_after_days?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_id"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "content_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      content_item_attachments: {
        Row: {
          id: string
          item_id: string
          kind: string
          label: string
          storage_path?: string
          external_url?: string
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          item_id: string
          kind: string
          label: string
          storage_path?: string
          external_url?: string
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          kind?: string
          label?: string
          storage_path?: string
          external_url?: string
          position?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_id"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          id: string
          area: string
          collection_id?: string
          type: string
          title: string
          slug: string
          description?: string
          body?: string
          position: number
          drip_after_days?: number
          tier_visibility: string
          media_provider: string
          bunny_video_id?: string
          storage_path?: string
          external_url?: string
          duration_seconds?: number
          cover_path?: string
          partner_id?: string
          metadata: Json
          status: string
          published_at?: string
          created_at: string
          updated_at: string
          handout_module?: string
        }
        Insert: {
          id?: string
          area: string
          collection_id?: string
          type: string
          title: string
          slug: string
          description?: string
          body?: string
          position?: number
          drip_after_days?: number
          tier_visibility?: string
          media_provider?: string
          bunny_video_id?: string
          storage_path?: string
          external_url?: string
          duration_seconds?: number
          cover_path?: string
          partner_id?: string
          metadata?: Json
          status?: string
          published_at?: string
          created_at?: string
          updated_at?: string
          handout_module?: string
        }
        Update: {
          id?: string
          area?: string
          collection_id?: string
          type?: string
          title?: string
          slug?: string
          description?: string
          body?: string
          position?: number
          drip_after_days?: number
          tier_visibility?: string
          media_provider?: string
          bunny_video_id?: string
          storage_path?: string
          external_url?: string
          duration_seconds?: number
          cover_path?: string
          partner_id?: string
          metadata?: Json
          status?: string
          published_at?: string
          created_at?: string
          updated_at?: string
          handout_module?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_id"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "content_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_id"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_last_seen: {
        Row: {
          id: string
          user_id: string
          conversation_id: string
          conversation_type: string
          last_seen_message_id?: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          user_id: string
          conversation_id: string
          conversation_type?: string
          last_seen_message_id?: string
          last_seen_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          conversation_id?: string
          conversation_type?: string
          last_seen_message_id?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      conversation_notes: {
        Row: {
          id: string
          conversation_id: string
          content: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          id?: string
          conversation_id: string
          content?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          id?: string
          conversation_id?: string
          content?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_id"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          id: string
          member_id: string
          last_message_at?: string
          created_at: string
          company_id?: string
          assigned_advisor_id?: string
          awaiting_reply_from?: string
          last_member_message_at?: string
          last_advisor_reply_at?: string
          acknowledged_at?: string
          acknowledged_by_advisor_id?: string
          conversation_status: string
          resolved_at?: string
          resolved_by_advisor_id?: string
          follow_up_at?: string
        }
        Insert: {
          id?: string
          member_id: string
          last_message_at?: string
          created_at?: string
          company_id?: string
          assigned_advisor_id?: string
          awaiting_reply_from?: string
          last_member_message_at?: string
          last_advisor_reply_at?: string
          acknowledged_at?: string
          acknowledged_by_advisor_id?: string
          conversation_status?: string
          resolved_at?: string
          resolved_by_advisor_id?: string
          follow_up_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          last_message_at?: string
          created_at?: string
          company_id?: string
          assigned_advisor_id?: string
          awaiting_reply_from?: string
          last_member_message_at?: string
          last_advisor_reply_at?: string
          acknowledged_at?: string
          acknowledged_by_advisor_id?: string
          conversation_status?: string
          resolved_at?: string
          resolved_by_advisor_id?: string
          follow_up_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_id"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          id: string
          message_id?: string
          template_name: string
          recipient_email: string
          status: string
          error_message?: string
          metadata?: Json
          created_at: string
          subject?: string
          is_test: boolean
        }
        Insert: {
          id?: string
          message_id?: string
          template_name: string
          recipient_email: string
          status: string
          error_message?: string
          metadata?: Json
          created_at?: string
          subject?: string
          is_test?: boolean
        }
        Update: {
          id?: string
          message_id?: string
          template_name?: string
          recipient_email?: string
          status?: string
          error_message?: string
          metadata?: Json
          created_at?: string
          subject?: string
          is_test?: boolean
        }
        Relationships: []
      }
      email_send_log_legacy: {
        Row: {
          id: string
          template_id: string
          recipient_email: string
          subject: string
          status: string
          error_message?: string
          sent_at: string
          is_test: boolean
        }
        Insert: {
          id?: string
          template_id: string
          recipient_email: string
          subject: string
          status?: string
          error_message?: string
          sent_at?: string
          is_test?: boolean
        }
        Update: {
          id?: string
          template_id?: string
          recipient_email?: string
          subject?: string
          status?: string
          error_message?: string
          sent_at?: string
          is_test?: boolean
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          id: number
          retry_after_until?: string
          batch_size: number
          send_delay_ms: number
          auth_email_ttl_minutes: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          id?: number
          retry_after_until?: string
          batch_size?: number
          send_delay_ms?: number
          auth_email_ttl_minutes?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          id?: number
          retry_after_until?: string
          batch_size?: number
          send_delay_ms?: number
          auth_email_ttl_minutes?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          id: string
          name: string
          subject: string
          body_html: string
          sender_name: string
          sender_email: string
          trigger_type: string
          trigger_config: Json
          enabled: boolean
          variables: Json
          created_at: string
          updated_at: string
          updated_by?: string
        }
        Insert: {
          id?: string
          name: string
          subject?: string
          body_html?: string
          sender_name?: string
          sender_email?: string
          trigger_type?: string
          trigger_config?: Json
          enabled?: boolean
          variables?: Json
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          id?: string
          name?: string
          subject?: string
          body_html?: string
          sender_name?: string
          sender_email?: string
          trigger_type?: string
          trigger_config?: Json
          enabled?: boolean
          variables?: Json
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          id: string
          token: string
          email: string
          created_at: string
          used_at?: string
        }
        Insert: {
          id?: string
          token: string
          email: string
          created_at?: string
          used_at?: string
        }
        Update: {
          id?: string
          token?: string
          email?: string
          created_at?: string
          used_at?: string
        }
        Relationships: []
      }
      event_registrations: {
        Row: {
          id: string
          event_id: string
          user_id: string
          registered_at: string
          cancelled_at?: string
          response: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          registered_at?: string
          cancelled_at?: string
          response?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          registered_at?: string
          cancelled_at?: string
          response?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_id"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          id: string
          title: string
          description?: string
          kind: string
          starts_at: string
          ends_at?: string
          meet_url?: string
          capacity?: number
          recording_item_id?: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string
          kind?: string
          starts_at: string
          ends_at?: string
          meet_url?: string
          capacity?: number
          recording_item_id?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string
          kind?: string
          starts_at?: string
          ends_at?: string
          meet_url?: string
          capacity?: number
          recording_item_id?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_item_id"
            columns: ["recording_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          id: string
          user_id: string
          company_id?: string
          category: string
          title: string
          description: string
          status: string
          admin_note?: string
          created_at: string
          resolved_at?: string
          screenshot_path?: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id?: string
          category?: string
          title: string
          description?: string
          status?: string
          admin_note?: string
          created_at?: string
          resolved_at?: string
          screenshot_path?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          category?: string
          title?: string
          description?: string
          status?: string
          admin_note?: string
          created_at?: string
          resolved_at?: string
          screenshot_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_commentaries: {
        Row: {
          id: string
          company_id: string
          period_key: string
          facts_id: string
          basis_metrics_hash: string
          basis_committed_at: string
          basis_source_type: string
          analysis: Json
          is_stale: boolean
          generated_by: string
          generated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          period_key: string
          facts_id: string
          basis_metrics_hash: string
          basis_committed_at: string
          basis_source_type: string
          analysis: Json
          is_stale?: boolean
          generated_by: string
          generated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          period_key?: string
          facts_id?: string
          basis_metrics_hash?: string
          basis_committed_at?: string
          basis_source_type?: string
          analysis?: Json
          is_stale?: boolean
          generated_by?: string
          generated_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_id"
            columns: ["facts_id"]
            isOneToOne: false
            referencedRelation: "financial_report_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_report_facts: {
        Row: {
          id: string
          company_id: string
          period_key: string
          period_label: string
          source_report_id: string
          source_type: string
          metrics: Json
          committed_at: string
          committed_by?: string
          created_at: string
          data_basis: string
        }
        Insert: {
          id?: string
          company_id: string
          period_key: string
          period_label: string
          source_report_id: string
          source_type: string
          metrics: Json
          committed_at?: string
          committed_by?: string
          created_at?: string
          data_basis?: string
        }
        Update: {
          id?: string
          company_id?: string
          period_key?: string
          period_label?: string
          source_report_id?: string
          source_type?: string
          metrics?: Json
          committed_at?: string
          committed_by?: string
          created_at?: string
          data_basis?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_report_id"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          id: string
          user_id: string
          file_name: string
          file_path: string
          report_type: string
          report_period?: string
          company_name?: string
          cvr_number?: string
          extracted_data?: Json
          uploaded_at: string
          processed_at?: string
          status: string
          ai_analysis?: Json
          company_id: string
          reviewed_at?: string
          deleted_at?: string
          raw_extracted_data?: Json
          normalized_data?: Json
          validation_status?: string
          validation_errors?: string[]
          extraction_method?: string
          manual_report_period_label?: string
          manual_report_period_key?: string
          manual_report_type?: string
          manual_normalized_data?: Json
          manual_override_note?: string
          manual_override_by?: string
          manual_override_at?: string
          manual_override_source?: string
          manual_override_status?: string
          extraction_contract_version: string
          quality_signals?: Json
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          file_path: string
          report_type: string
          report_period?: string
          company_name?: string
          cvr_number?: string
          extracted_data?: Json
          uploaded_at?: string
          processed_at?: string
          status?: string
          ai_analysis?: Json
          company_id: string
          reviewed_at?: string
          deleted_at?: string
          raw_extracted_data?: Json
          normalized_data?: Json
          validation_status?: string
          validation_errors?: string[]
          extraction_method?: string
          manual_report_period_label?: string
          manual_report_period_key?: string
          manual_report_type?: string
          manual_normalized_data?: Json
          manual_override_note?: string
          manual_override_by?: string
          manual_override_at?: string
          manual_override_source?: string
          manual_override_status?: string
          extraction_contract_version?: string
          quality_signals?: Json
        }
        Update: {
          id?: string
          user_id?: string
          file_name?: string
          file_path?: string
          report_type?: string
          report_period?: string
          company_name?: string
          cvr_number?: string
          extracted_data?: Json
          uploaded_at?: string
          processed_at?: string
          status?: string
          ai_analysis?: Json
          company_id?: string
          reviewed_at?: string
          deleted_at?: string
          raw_extracted_data?: Json
          normalized_data?: Json
          validation_status?: string
          validation_errors?: string[]
          extraction_method?: string
          manual_report_period_label?: string
          manual_report_period_key?: string
          manual_report_type?: string
          manual_normalized_data?: Json
          manual_override_note?: string
          manual_override_by?: string
          manual_override_at?: string
          manual_override_source?: string
          manual_override_status?: string
          extraction_contract_version?: string
          quality_signals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      handout_lever_milestones: {
        Row: {
          id: string
          handout_id: string
          lever_index: number
          milestone_id: string
          created_at: string
        }
        Insert: {
          id?: string
          handout_id: string
          lever_index: number
          milestone_id: string
          created_at?: string
        }
        Update: {
          id?: string
          handout_id?: string
          lever_index?: number
          milestone_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handout_id"
            columns: ["handout_id"]
            isOneToOne: false
            referencedRelation: "handouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_id"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      handouts: {
        Row: {
          id: string
          user_id: string
          module: string
          responses: Json
          checklist: Json
          levers: Json
          status: string
          ai_feedback?: Json
          ai_feedback_at?: string
          completed_at?: string
          created_at: string
          updated_at: string
          company_id: string
        }
        Insert: {
          id?: string
          user_id: string
          module: string
          responses?: Json
          checklist?: Json
          levers?: Json
          status?: string
          ai_feedback?: Json
          ai_feedback_at?: string
          completed_at?: string
          created_at?: string
          updated_at?: string
          company_id: string
        }
        Update: {
          id?: string
          user_id?: string
          module?: string
          responses?: Json
          checklist?: Json
          levers?: Json
          status?: string
          ai_feedback?: Json
          ai_feedback_at?: string
          completed_at?: string
          created_at?: string
          updated_at?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_benchmarks: {
        Row: {
          id: string
          industry_code: string
          industry_label: string
          kpi_key: string
          benchmark_value: number
          benchmark_label: string
          benchmark_min: number
          benchmark_max: number
          source_label: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          industry_code: string
          industry_label: string
          kpi_key: string
          benchmark_value: number
          benchmark_label: string
          benchmark_min: number
          benchmark_max: number
          source_label?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          industry_code?: string
          industry_label?: string
          kpi_key?: string
          benchmark_value?: number
          benchmark_label?: string
          benchmark_min?: number
          benchmark_max?: number
          source_label?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      kpi_benchmarks: {
        Row: {
          id: string
          user_id: string
          kpi_key: string
          benchmark_value: number
          benchmark_label: string
          source_label: string
          created_at: string
          updated_at: string
          company_id: string
        }
        Insert: {
          id?: string
          user_id: string
          kpi_key: string
          benchmark_value: number
          benchmark_label?: string
          source_label?: string
          created_at?: string
          updated_at?: string
          company_id: string
        }
        Update: {
          id?: string
          user_id?: string
          kpi_key?: string
          benchmark_value?: number
          benchmark_label?: string
          source_label?: string
          created_at?: string
          updated_at?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_chart_comments: {
        Row: {
          id: string
          company_id: string
          period_key: string
          period_label: string
          kpi_key: string
          content: string
          author_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          period_key: string
          period_label: string
          kpi_key: string
          content: string
          author_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          period_key?: string
          period_label?: string
          kpi_key?: string
          content?: string
          author_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_targets: {
        Row: {
          id: string
          user_id: string
          kpi_key: string
          target_value: number
          target_label: string
          lower_is_better: boolean
          created_at: string
          updated_at: string
          company_id: string
        }
        Insert: {
          id?: string
          user_id: string
          kpi_key: string
          target_value: number
          target_label?: string
          lower_is_better?: boolean
          created_at?: string
          updated_at?: string
          company_id: string
        }
        Update: {
          id?: string
          user_id?: string
          kpi_key?: string
          target_value?: number
          target_label?: string
          lower_is_better?: boolean
          created_at?: string
          updated_at?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      legat_enrollments: {
        Row: {
          id: string
          user_id: string
          company_id: string
          start_date: string
          status: string
          momentumkald_booked: boolean
          notes?: string
          created_by?: string
          created_at: string
          upgraded_at?: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          start_date?: string
          status?: string
          momentumkald_booked?: boolean
          notes?: string
          created_by?: string
          created_at?: string
          upgraded_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          start_date?: string
          status?: string
          momentumkald_booked?: boolean
          notes?: string
          created_by?: string
          created_at?: string
          upgraded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_profiles: {
        Row: {
          user_id: string
          linkedin_url?: string
          expertise: string[]
          created_at: string
          updated_at: string
          ask_me_about?: string
          working_on?: string
          working_on_updated_at?: string
        }
        Insert: {
          user_id: string
          linkedin_url?: string
          expertise?: string[]
          created_at?: string
          updated_at?: string
          ask_me_about?: string
          working_on?: string
          working_on_updated_at?: string
        }
        Update: {
          user_id?: string
          linkedin_url?: string
          expertise?: string[]
          created_at?: string
          updated_at?: string
          ask_me_about?: string
          working_on?: string
          working_on_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_progress: {
        Row: {
          id: string
          user_id: string
          content_item_id: string
          seen_at?: string
          acknowledged_at?: string
          skipped_at?: string
          last_position_seconds?: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content_item_id: string
          seen_at?: string
          acknowledged_at?: string
          skipped_at?: string
          last_position_seconds?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          content_item_id?: string
          seen_at?: string
          acknowledged_at?: string
          skipped_at?: string
          last_position_seconds?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_item_id"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          id: string
          message_id: string
          message_table: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          message_table: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          message_table?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          read_at?: string
          created_at: string
          message_type: string
          context_type?: string
          context_id?: string
          context_meta?: Json
          pinned_at?: string
          edited_at?: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content: string
          read_at?: string
          created_at?: string
          message_type?: string
          context_type?: string
          context_id?: string
          context_meta?: Json
          pinned_at?: string
          edited_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string
          read_at?: string
          created_at?: string
          message_type?: string
          context_type?: string
          context_id?: string
          context_meta?: Json
          pinned_at?: string
          edited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_id"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          id: string
          user_id: string
          title: string
          description?: string
          deadline?: string
          progress: number
          status: string
          source: string
          source_report?: string
          created_at: string
          updated_at: string
          company_id: string
          category: string
          baseline?: string
          target_value?: number
          current_value?: number
          unit?: string
          progress_updated_at?: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string
          deadline?: string
          progress?: number
          status?: string
          source?: string
          source_report?: string
          created_at?: string
          updated_at?: string
          company_id: string
          category?: string
          baseline?: string
          target_value?: number
          current_value?: number
          unit?: string
          progress_updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string
          deadline?: string
          progress?: number
          status?: string
          source?: string
          source_report?: string
          created_at?: string
          updated_at?: string
          company_id?: string
          category?: string
          baseline?: string
          target_value?: number
          current_value?: number
          unit?: string
          progress_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          priority: string
          title: string
          body?: string
          reference_type?: string
          reference_id?: string
          deep_link?: string
          company_id?: string
          dedup_key: string
          seen_at?: string
          read_at?: string
          email_sent_at?: string
          push_sent_at?: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          priority?: string
          title: string
          body?: string
          reference_type?: string
          reference_id?: string
          deep_link?: string
          company_id?: string
          dedup_key: string
          seen_at?: string
          read_at?: string
          email_sent_at?: string
          push_sent_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          priority?: string
          title?: string
          body?: string
          reference_type?: string
          reference_id?: string
          deep_link?: string
          company_id?: string
          dedup_key?: string
          seen_at?: string
          read_at?: string
          email_sent_at?: string
          push_sent_at?: string
          created_at?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          id: string
          name: string
          category: string
          description?: string
          discount_text: string
          redemption_type: string
          redemption_code?: string
          redemption_url?: string
          redemption_contact?: string
          logo_path?: string
          website_url?: string
          valid_until?: string
          position: number
          status: string
          created_at: string
          updated_at: string
          indhold?: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          description?: string
          discount_text: string
          redemption_type: string
          redemption_code?: string
          redemption_url?: string
          redemption_contact?: string
          logo_path?: string
          website_url?: string
          valid_until?: string
          position?: number
          status?: string
          created_at?: string
          updated_at?: string
          indhold?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          description?: string
          discount_text?: string
          redemption_type?: string
          redemption_code?: string
          redemption_url?: string
          redemption_contact?: string
          logo_path?: string
          website_url?: string
          valid_until?: string
          position?: number
          status?: string
          created_at?: string
          updated_at?: string
          indhold?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          full_name: string
          company_name?: string
          avatar_url?: string
          created_at: string
          updated_at: string
          onboarded_at?: string
          email?: string
          tour_completed_at?: string
          notification_email_prefs?: Json
          velkomstvideo_set_at?: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name?: string
          company_name?: string
          avatar_url?: string
          created_at?: string
          updated_at?: string
          onboarded_at?: string
          email?: string
          tour_completed_at?: string
          notification_email_prefs?: Json
          velkomstvideo_set_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string
          company_name?: string
          avatar_url?: string
          created_at?: string
          updated_at?: string
          onboarded_at?: string
          email?: string
          tour_completed_at?: string
          notification_email_prefs?: Json
          velkomstvideo_set_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      pulse_checkins: {
        Row: {
          id: string
          company_id: string
          user_id: string
          period_key: string
          went_well?: string
          biggest_challenge?: string
          milestone_progress?: number
          created_at: string
          help_needed?: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          period_key: string
          went_well?: string
          biggest_challenge?: string
          milestone_progress?: number
          created_at?: string
          help_needed?: string
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string
          period_key?: string
          went_well?: string
          biggest_challenge?: string
          milestone_progress?: number
          created_at?: string
          help_needed?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      session_bookings: {
        Row: {
          id: string
          user_id: string
          company_id?: string
          stripe_session_id?: string
          stripe_payment_intent_id?: string
          amount_dkk: number
          status: string
          calendly_booking_url?: string
          calendly_event_uri?: string
          created_at: string
          updated_at: string
          advisor: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id?: string
          stripe_session_id?: string
          stripe_payment_intent_id?: string
          amount_dkk: number
          status?: string
          calendly_booking_url?: string
          calendly_event_uri?: string
          created_at?: string
          updated_at?: string
          advisor?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          stripe_session_id?: string
          stripe_payment_intent_id?: string
          amount_dkk?: number
          status?: string
          calendly_booking_url?: string
          calendly_event_uri?: string
          created_at?: string
          updated_at?: string
          advisor?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_conversation_threads: {
        Row: {
          id: string
          conversation_id: string
          company_id: string
          slack_channel_id: string
          slack_thread_ts?: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          company_id: string
          slack_channel_id: string
          slack_thread_ts?: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          company_id?: string
          slack_channel_id?: string
          slack_thread_ts?: string
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_id"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_handout_notification_log: {
        Row: {
          id: string
          handout_id: string
          completed_at: string
          company_id: string
          slack_channel_id: string
          slack_ts?: string
          created_at: string
        }
        Insert: {
          id?: string
          handout_id: string
          completed_at: string
          company_id: string
          slack_channel_id: string
          slack_ts?: string
          created_at?: string
        }
        Update: {
          id?: string
          handout_id?: string
          completed_at?: string
          company_id?: string
          slack_channel_id?: string
          slack_ts?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handout_id"
            columns: ["handout_id"]
            isOneToOne: false
            referencedRelation: "handouts"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_notification_log: {
        Row: {
          id: string
          message_id: string
          conversation_id: string
          company_id: string
          notification_type: string
          slack_channel_id: string
          slack_ts?: string
          slack_thread_ts?: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          conversation_id: string
          company_id: string
          notification_type?: string
          slack_channel_id: string
          slack_ts?: string
          slack_thread_ts?: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          conversation_id?: string
          company_id?: string
          notification_type?: string
          slack_channel_id?: string
          slack_ts?: string
          slack_thread_ts?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_id"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_id"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_report_notification_log: {
        Row: {
          id: string
          report_id: string
          message_id: string
          company_id: string
          slack_channel_id: string
          slack_ts?: string
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          message_id: string
          company_id: string
          slack_channel_id: string
          slack_ts?: string
          created_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          message_id?: string
          company_id?: string
          slack_channel_id?: string
          slack_ts?: string
          created_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          id: string
          email: string
          reason: string
          metadata?: Json
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          reason: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          reason?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      user_login_log: {
        Row: {
          id: string
          user_id: string
          logged_in_at: string
          ip_address?: string
        }
        Insert: {
          id?: string
          user_id: string
          logged_in_at?: string
          ip_address?: string
        }
        Update: {
          id?: string
          user_id?: string
          logged_in_at?: string
          ip_address?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_focus: {
        Row: {
          id: string
          company_id: string
          week_key: string
          status: string
          triggers_fired: Json
          trigger_data: Json
          headline?: string
          summary?: string
          actions_generated: number
          data_freshness_days?: number
          generated_at: string
          seen_at?: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          week_key: string
          status?: string
          triggers_fired?: Json
          trigger_data?: Json
          headline?: string
          summary?: string
          actions_generated?: number
          data_freshness_days?: number
          generated_at?: string
          seen_at?: string
          expires_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          week_key?: string
          status?: string
          triggers_fired?: Json
          trigger_data?: Json
          headline?: string
          summary?: string
          actions_generated?: number
          data_freshness_days?: number
          generated_at?: string
          seen_at?: string
          expires_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_id"
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
      cleanup_facts_on_report_delete: {
        Args: { [_ in never]: never }
        Returns: void
      }
      cleanup_stale_processing_reports: {
        Args: { [_ in never]: never }
        Returns: number
      }
      commit_report_facts: {
        Args: { [_ in never]: never }
        Returns: any
      }
      community_json_til_tekst: {
        Args: { [_ in never]: never }
        Returns: string
      }
      community_opdater_svar_taellere: {
        Args: { [_ in never]: never }
        Returns: void
      }
      community_opdater_visningstaeller: {
        Args: { [_ in never]: never }
        Returns: void
      }
      compute_facts_metrics_hash: {
        Args: { [_ in never]: never }
        Returns: string
      }
      delete_email: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      dispose_report_notifications: {
        Args: { [_ in never]: never }
        Returns: void
      }
      email_queue_dispatch: {
        Args: { [_ in never]: never }
        Returns: void
      }
      email_queue_wake: {
        Args: { [_ in never]: never }
        Returns: void
      }
      enqueue_email: {
        Args: { [_ in never]: never }
        Returns: number
      }
      get_all_advisor_profiles: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_community_feed: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_community_medlemmer: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_community_svar: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_community_traad: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_conversation_sender_profiles: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_event_non_responders: {
        Args: { [_ in never]: never }
        Returns: string
      }
      get_event_participants: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_member_directory: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_member_profile: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_report_commit_preview: {
        Args: { [_ in never]: never }
        Returns: Json
      }
      get_report_commit_states: {
        Args: { [_ in never]: never }
        Returns: any
      }
      get_users_last_login: {
        Args: { [_ in never]: never }
        Returns: any
      }
      guard_facts_period_window: {
        Args: { [_ in never]: never }
        Returns: void
      }
      handle_new_user: {
        Args: { [_ in never]: never }
        Returns: void
      }
      har_aktivt_abonnement: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      har_aktivt_medlemskab: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      has_role: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      hent_betalingsdata_til_checkout: {
        Args: { [_ in never]: never }
        Returns: Json
      }
      hent_betalingstilbud: {
        Args: { [_ in never]: never }
        Returns: Json
      }
      is_legat_user: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      is_membership_active: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      legat_day: {
        Args: { [_ in never]: never }
        Returns: number
      }
      legat_unlocked_modules: {
        Args: { [_ in never]: never }
        Returns: any
      }
      log_user_login: {
        Args: { [_ in never]: never }
        Returns: void
      }
      lookup_invite_company: {
        Args: { [_ in never]: never }
        Returns: string
      }
      lookup_invite_company_info: {
        Args: { [_ in never]: never }
        Returns: Json
      }
      maa_se_community_billede: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      maa_se_community_fil: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      mark_commentaries_stale: {
        Args: { [_ in never]: never }
        Returns: void
      }
      mark_messages_read: {
        Args: { [_ in never]: never }
        Returns: number
      }
      mark_notification_read: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      mark_notifications_seen: {
        Args: { [_ in never]: never }
        Returns: number
      }
      move_to_dlq: {
        Args: { [_ in never]: never }
        Returns: number
      }
      normalize_invitation_email: {
        Args: { [_ in never]: never }
        Returns: void
      }
      opret_community_svar: {
        Args: { [_ in never]: never }
        Returns: string
      }
      opret_community_traad: {
        Args: { [_ in never]: never }
        Returns: string
      }
      parse_dk_report_period_key: {
        Args: { [_ in never]: never }
        Returns: string
      }
      protect_community_svar_immutable_fields: {
        Args: { [_ in never]: never }
        Returns: void
      }
      protect_community_traad_immutable_fields: {
        Args: { [_ in never]: never }
        Returns: void
      }
      protect_conversation_ops_fields: {
        Args: { [_ in never]: never }
        Returns: void
      }
      protect_handout_immutable_fields: {
        Args: { [_ in never]: never }
        Returns: void
      }
      protect_message_immutable_fields: {
        Args: { [_ in never]: never }
        Returns: void
      }
      read_email_batch: {
        Args: { [_ in never]: never }
        Returns: any
      }
      registrer_community_visning: {
        Args: { [_ in never]: never }
        Returns: void
      }
      resolve_report_commit_candidate: {
        Args: { [_ in never]: never }
        Returns: any
      }
      ret_community_svar: {
        Args: { [_ in never]: never }
        Returns: void
      }
      ret_community_traad: {
        Args: { [_ in never]: never }
        Returns: void
      }
      saet_community_reaktion: {
        Args: { [_ in never]: never }
        Returns: boolean
      }
      skjul_community_traad: {
        Args: { [_ in never]: never }
        Returns: void
      }
      slet_community_svar: {
        Args: { [_ in never]: never }
        Returns: void
      }
      slet_community_traad: {
        Args: { [_ in never]: never }
        Returns: void
      }
      stamp_conversation_note_metadata: {
        Args: { [_ in never]: never }
        Returns: void
      }
      update_conversation_last_message: {
        Args: { [_ in never]: never }
        Returns: void
      }
      update_conversation_reply_state: {
        Args: { [_ in never]: never }
        Returns: void
      }
      update_milestone_progress_timestamp: {
        Args: { [_ in never]: never }
        Returns: void
      }
      update_updated_at_column: {
        Args: { [_ in never]: never }
        Returns: void
      }
      user_company_id: {
        Args: { [_ in never]: never }
        Returns: string
      }
      validate_conversation_advisor_assignment: {
        Args: { [_ in never]: never }
        Returns: void
      }
    }
    Enums: {
      app_role: "member" | "advisor" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
// test
