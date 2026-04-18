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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      boosts: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          priority_score: number
          status: Database["public"]["Enums"]["boost_status"]
          streamer_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at?: string
          id?: string
          priority_score?: number
          status?: Database["public"]["Enums"]["boost_status"]
          streamer_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          priority_score?: number
          status?: Database["public"]["Enums"]["boost_status"]
          streamer_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boosts_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempted_at: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json
          notification_id: string
          provider_message_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Insert: {
          attempted_at?: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          notification_id: string
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Update: {
          attempted_at?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          notification_id?: string
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      donation_events: {
        Row: {
          amount: number
          created_at: string
          donation_link_id: string | null
          donor_name: string
          donor_user_id: string | null
          id: string
          message: string | null
          source: string
          status: Database["public"]["Enums"]["donation_status"]
          streamer_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          donation_link_id?: string | null
          donor_name: string
          donor_user_id?: string | null
          id?: string
          message?: string | null
          source?: string
          status?: Database["public"]["Enums"]["donation_status"]
          streamer_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          donation_link_id?: string | null
          donor_name?: string
          donor_user_id?: string | null
          id?: string
          message?: string | null
          source?: string
          status?: Database["public"]["Enums"]["donation_status"]
          streamer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donation_events_donation_link_id_fkey"
            columns: ["donation_link_id"]
            isOneToOne: false
            referencedRelation: "streamer_donation_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donation_events_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_orders: {
        Row: {
          created_at: string
          currency: string
          external_order_id: number | null
          external_payload: Json
          failure_reason: string | null
          id: string
          quantity: number
          quoted_amount: number
          requester_user_id: string | null
          service_category: string
          service_id: number
          service_name: string
          service_rate: number
          service_type: string
          status: Database["public"]["Enums"]["promotion_order_status"]
          streamer_id: string | null
          target_link: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          external_order_id?: number | null
          external_payload?: Json
          failure_reason?: string | null
          id?: string
          quantity: number
          quoted_amount?: number
          requester_user_id?: string | null
          service_category: string
          service_id: number
          service_name: string
          service_rate?: number
          service_type: string
          status?: Database["public"]["Enums"]["promotion_order_status"]
          streamer_id?: string | null
          target_link: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          external_order_id?: number | null
          external_payload?: Json
          failure_reason?: string | null
          id?: string
          quantity?: number
          quoted_amount?: number
          requester_user_id?: string | null
          service_category?: string
          service_id?: number
          service_name?: string
          service_rate?: number
          service_type?: string
          status?: Database["public"]["Enums"]["promotion_order_status"]
          streamer_id?: string | null
          target_link?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_orders_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_score: number
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          last_activity_at: string | null
          level: number
          onboarding_completed: boolean
          points: number
          preferred_language: string
          referred_streamer_id: string | null
          streak_days: number
          telegram_linked_at: string | null
          telegram_user_id: number | null
          telegram_username: string | null
          tiktok_username: string | null
          updated_at: string
          username: string
        }
        Insert: {
          activity_score?: number
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          last_activity_at?: string | null
          level?: number
          onboarding_completed?: boolean
          points?: number
          preferred_language?: string
          referred_streamer_id?: string | null
          streak_days?: number
          telegram_linked_at?: string | null
          telegram_user_id?: number | null
          telegram_username?: string | null
          tiktok_username?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          activity_score?: number
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_activity_at?: string | null
          level?: number
          onboarding_completed?: boolean
          points?: number
          preferred_language?: string
          referred_streamer_id?: string | null
          streak_days?: number
          telegram_linked_at?: string | null
          telegram_user_id?: number | null
          telegram_username?: string | null
          tiktok_username?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      raid_requests: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          message: string | null
          requested_by: string | null
          starts_at: string
          status: string
          streamer_id: string
          target_streamer_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          message?: string | null
          requested_by?: string | null
          starts_at?: string
          status?: string
          streamer_id: string
          target_streamer_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          message?: string | null
          requested_by?: string | null
          starts_at?: string
          status?: string
          streamer_id?: string
          target_streamer_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raid_requests_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raid_requests_target_streamer_id_fkey"
            columns: ["target_streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          streamer_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          streamer_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          streamer_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_events: {
        Row: {
          created_at: string
          event_timestamp: string
          event_type: Database["public"]["Enums"]["stream_event_type"]
          external_viewer_id: string | null
          id: string
          normalized_payload: Json
          raw_payload: Json
          source: string
          stream_session_id: string
          streamer_id: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          event_timestamp?: string
          event_type: Database["public"]["Enums"]["stream_event_type"]
          external_viewer_id?: string | null
          id?: string
          normalized_payload?: Json
          raw_payload?: Json
          source?: string
          stream_session_id: string
          streamer_id: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          event_timestamp?: string
          event_type?: Database["public"]["Enums"]["stream_event_type"]
          external_viewer_id?: string | null
          id?: string
          normalized_payload?: Json
          raw_payload?: Json
          source?: string
          stream_session_id?: string
          streamer_id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_events_stream_session_id_fkey"
            columns: ["stream_session_id"]
            isOneToOne: false
            referencedRelation: "stream_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_events_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_sessions: {
        Row: {
          created_at: string
          current_viewer_count: number
          ended_at: string | null
          external_stream_id: string | null
          gift_count: number
          id: string
          like_count: number
          message_count: number
          peak_viewer_count: number
          raw_snapshot: Json
          source: string
          started_at: string
          status: Database["public"]["Enums"]["stream_session_status"]
          streamer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_viewer_count?: number
          ended_at?: string | null
          external_stream_id?: string | null
          gift_count?: number
          id?: string
          like_count?: number
          message_count?: number
          peak_viewer_count?: number
          raw_snapshot?: Json
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["stream_session_status"]
          streamer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_viewer_count?: number
          ended_at?: string | null
          external_stream_id?: string | null
          gift_count?: number
          id?: string
          like_count?: number
          message_count?: number
          peak_viewer_count?: number
          raw_snapshot?: Json
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["stream_session_status"]
          streamer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_sessions_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          is_featured: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          post_id: string | null
          sort_order: number
          streamer_id: string
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          post_id?: string | null
          sort_order?: number
          streamer_id: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          post_id?: string | null
          sort_order?: number
          streamer_id?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "streamer_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "streamer_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streamer_media_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_donation_links: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          minimum_amount: number
          slug: string
          streamer_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          minimum_amount?: number
          slug: string
          streamer_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          minimum_amount?: number
          slug?: string
          streamer_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streamer_donation_links_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: true
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_page_settings: {
        Row: {
          accent_color: string | null
          banner_url: string | null
          created_at: string
          description: string | null
          featured_video_url: string | null
          headline: string | null
          id: string
          layout: Json
          logo_url: string | null
          streamer_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          featured_video_url?: string | null
          headline?: string | null
          id?: string
          layout?: Json
          logo_url?: string | null
          streamer_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          featured_video_url?: string | null
          headline?: string | null
          id?: string
          layout?: Json
          logo_url?: string | null
          streamer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streamer_page_settings_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: true
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_posts: {
        Row: {
          author_user_id: string | null
          body: string | null
          blur_preview: boolean
          cover_url: string | null
          created_at: string
          expires_at: string | null
          external_url: string | null
          id: string
          is_published: boolean
          post_type: Database["public"]["Enums"]["content_post_type"]
          published_at: string | null
          required_plan: Database["public"]["Enums"]["subscription_plan_key"]
          streamer_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_user_id?: string | null
          body?: string | null
          blur_preview?: boolean
          cover_url?: string | null
          created_at?: string
          expires_at?: string | null
          external_url?: string | null
          id?: string
          is_published?: boolean
          post_type?: Database["public"]["Enums"]["content_post_type"]
          published_at?: string | null
          required_plan?: Database["public"]["Enums"]["subscription_plan_key"]
          streamer_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string | null
          body?: string | null
          blur_preview?: boolean
          cover_url?: string | null
          created_at?: string
          expires_at?: string | null
          external_url?: string | null
          id?: string
          is_published?: boolean
          post_type?: Database["public"]["Enums"]["content_post_type"]
          published_at?: string | null
          required_plan?: Database["public"]["Enums"]["subscription_plan_key"]
          streamer_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streamer_posts_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_subscriptions: {
        Row: {
          created_at: string
          id: string
          notification_enabled: boolean
          paid_until: string | null
          plan_key: Database["public"]["Enums"]["subscription_plan_key"]
          streamer_id: string
          telegram_enabled: boolean
          total_paid_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_enabled?: boolean
          paid_until?: string | null
          plan_key?: Database["public"]["Enums"]["subscription_plan_key"]
          streamer_id: string
          telegram_enabled?: boolean
          total_paid_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_enabled?: boolean
          paid_until?: string | null
          plan_key?: Database["public"]["Enums"]["subscription_plan_key"]
          streamer_id?: string
          telegram_enabled?: boolean
          total_paid_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streamer_subscriptions_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_team_memberships: {
        Row: {
          achievement_count: number
          available_features: Json
          comment_count: number
          created_at: string
          gift_count: number
          id: string
          last_event_at: string | null
          like_count: number
          streamer_id: string
          team_level: number
          team_points: number
          total_gift_diamonds: number
          updated_at: string
          user_id: string
          watch_seconds: number
        }
        Insert: {
          achievement_count?: number
          available_features?: Json
          comment_count?: number
          created_at?: string
          gift_count?: number
          id?: string
          last_event_at?: string | null
          like_count?: number
          streamer_id: string
          team_level?: number
          team_points?: number
          total_gift_diamonds?: number
          updated_at?: string
          user_id: string
          watch_seconds?: number
        }
        Update: {
          achievement_count?: number
          available_features?: Json
          comment_count?: number
          created_at?: string
          gift_count?: number
          id?: string
          last_event_at?: string | null
          like_count?: number
          streamer_id?: string
          team_level?: number
          team_points?: number
          total_gift_diamonds?: number
          updated_at?: string
          user_id?: string
          watch_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "streamer_team_memberships_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_post_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction_type: Database["public"]["Enums"]["post_reaction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction_type: Database["public"]["Enums"]["post_reaction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction_type?: Database["public"]["Enums"]["post_reaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streamer_post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "streamer_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      streamer_verifications: {
        Row: {
          created_at: string
          evidence_type: string | null
          evidence_value: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["streamer_verification_status"]
          streamer_id: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_type?: string | null
          evidence_value?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["streamer_verification_status"]
          streamer_id: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_type?: string | null
          evidence_value?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["streamer_verification_status"]
          streamer_id?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streamer_verifications_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      streamers: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          followers_count: number
          id: string
          is_live: boolean
          last_checked_live_at: string | null
          last_live_at: string | null
          logo_url: string | null
          needs_boost: boolean
          priority_score: number
          tagline: string | null
          telegram_channel: string | null
          telegram_chat_id: number | null
          tiktok_username: string
          total_boost_amount: number
          total_traffic_sent: number
          tracking_enabled: boolean
          tracking_source: string | null
          updated_at: string
          user_id: string | null
          verification_method: string | null
          verification_status: Database["public"]["Enums"]["streamer_verification_status"]
          verified_at: string | null
          viewer_count: number
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          followers_count?: number
          id?: string
          is_live?: boolean
          last_checked_live_at?: string | null
          last_live_at?: string | null
          logo_url?: string | null
          needs_boost?: boolean
          priority_score?: number
          tagline?: string | null
          telegram_channel?: string | null
          telegram_chat_id?: number | null
          tiktok_username: string
          total_boost_amount?: number
          total_traffic_sent?: number
          tracking_enabled?: boolean
          tracking_source?: string | null
          updated_at?: string
          user_id?: string | null
          verification_method?: string | null
          verification_status?: Database["public"]["Enums"]["streamer_verification_status"]
          verified_at?: string | null
          viewer_count?: number
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          followers_count?: number
          id?: string
          is_live?: boolean
          last_checked_live_at?: string | null
          last_live_at?: string | null
          logo_url?: string | null
          needs_boost?: boolean
          priority_score?: number
          tagline?: string | null
          telegram_channel?: string | null
          telegram_chat_id?: number | null
          tiktok_username?: string
          total_boost_amount?: number
          total_traffic_sent?: number
          tracking_enabled?: boolean
          tracking_source?: string | null
          updated_at?: string
          user_id?: string | null
          verification_method?: string | null
          verification_status?: Database["public"]["Enums"]["streamer_verification_status"]
          verified_at?: string | null
          viewer_count?: number
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          completed_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          active: boolean
          auto_disable_on_live_end: boolean
          code: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          reward_points: number
          stream_session_id: string | null
          streamer_id: string | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          active?: boolean
          auto_disable_on_live_end?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          reward_points?: number
          stream_session_id?: string | null
          streamer_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          active?: boolean
          auto_disable_on_live_end?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          reward_points?: number
          stream_session_id?: string | null
          streamer_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_stream_session_id_fkey"
            columns: ["stream_session_id"]
            isOneToOne: false
            referencedRelation: "stream_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chat_members: {
        Row: {
          display_name: string | null
          id: string
          joined_at: string
          last_seen_at: string | null
          member_role: Database["public"]["Enums"]["telegram_member_role"]
          metadata: Json
          status: string
          telegram_chat_id: string
          telegram_user_id: number
          telegram_username: string | null
          user_id: string | null
        }
        Insert: {
          display_name?: string | null
          id?: string
          joined_at?: string
          last_seen_at?: string | null
          member_role?: Database["public"]["Enums"]["telegram_member_role"]
          metadata?: Json
          status?: string
          telegram_chat_id: string
          telegram_user_id: number
          telegram_username?: string | null
          user_id?: string | null
        }
        Update: {
          display_name?: string | null
          id?: string
          joined_at?: string
          last_seen_at?: string | null
          member_role?: Database["public"]["Enums"]["telegram_member_role"]
          metadata?: Json
          status?: string
          telegram_chat_id?: string
          telegram_user_id?: number
          telegram_username?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_chat_members_telegram_chat_id_fkey"
            columns: ["telegram_chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chats: {
        Row: {
          chat_id: number
          chat_kind: Database["public"]["Enums"]["telegram_chat_kind"]
          created_at: string
          created_by: string | null
          id: string
          invite_link: string | null
          is_primary: boolean
          metadata: Json
          moderation_enabled: boolean
          notifications_enabled: boolean
          streamer_id: string | null
          title: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          chat_id: number
          chat_kind: Database["public"]["Enums"]["telegram_chat_kind"]
          created_at?: string
          created_by?: string | null
          id?: string
          invite_link?: string | null
          is_primary?: boolean
          metadata?: Json
          moderation_enabled?: boolean
          notifications_enabled?: boolean
          streamer_id?: string | null
          title?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          chat_id?: number
          chat_kind?: Database["public"]["Enums"]["telegram_chat_kind"]
          created_at?: string
          created_by?: string | null
          id?: string
          invite_link?: string | null
          is_primary?: boolean
          metadata?: Json
          moderation_enabled?: boolean
          notifications_enabled?: boolean
          streamer_id?: string | null
          title?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_chats_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_links: {
        Row: {
          bot_enabled: boolean
          created_at: string
          id: string
          linked_at: string
          role: Database["public"]["Enums"]["app_role"]
          telegram_chat_id: number | null
          telegram_user_id: number | null
          telegram_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_enabled?: boolean
          created_at?: string
          id?: string
          linked_at?: string
          role: Database["public"]["Enums"]["app_role"]
          telegram_chat_id?: number | null
          telegram_user_id?: number | null
          telegram_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_enabled?: boolean
          created_at?: string
          id?: string
          linked_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          telegram_chat_id?: number | null
          telegram_user_id?: number | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_moderation_actions: {
        Row: {
          acted_by_bot: boolean
          acted_by_user_id: string | null
          action_type: Database["public"]["Enums"]["telegram_moderation_action_type"]
          created_at: string
          duration_seconds: number | null
          executed_at: string | null
          id: string
          incident_id: string | null
          member_id: string | null
          metadata: Json
          provider_action_id: string | null
          reason: string | null
          status: Database["public"]["Enums"]["telegram_moderation_status"]
          streamer_id: string | null
          telegram_chat_id: string
          telegram_user_id: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acted_by_bot?: boolean
          acted_by_user_id?: string | null
          action_type: Database["public"]["Enums"]["telegram_moderation_action_type"]
          created_at?: string
          duration_seconds?: number | null
          executed_at?: string | null
          id?: string
          incident_id?: string | null
          member_id?: string | null
          metadata?: Json
          provider_action_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["telegram_moderation_status"]
          streamer_id?: string | null
          telegram_chat_id: string
          telegram_user_id: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acted_by_bot?: boolean
          acted_by_user_id?: string | null
          action_type?: Database["public"]["Enums"]["telegram_moderation_action_type"]
          created_at?: string
          duration_seconds?: number | null
          executed_at?: string | null
          id?: string
          incident_id?: string | null
          member_id?: string | null
          metadata?: Json
          provider_action_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["telegram_moderation_status"]
          streamer_id?: string | null
          telegram_chat_id?: string
          telegram_user_id?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_moderation_actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "telegram_moderation_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_moderation_actions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "telegram_chat_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_moderation_actions_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_moderation_actions_telegram_chat_id_fkey"
            columns: ["telegram_chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_moderation_incidents: {
        Row: {
          created_at: string
          id: string
          member_id: string | null
          occurred_at: string
          payload: Json
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          severity: string
          status: string
          streamer_id: string | null
          telegram_chat_id: string
          telegram_user_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_id?: string | null
          occurred_at?: string
          payload?: Json
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string
          status?: string
          streamer_id?: string | null
          telegram_chat_id: string
          telegram_user_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string | null
          occurred_at?: string
          payload?: Json
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string
          status?: string
          streamer_id?: string | null
          telegram_chat_id?: string
          telegram_user_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_moderation_incidents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "telegram_chat_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_moderation_incidents_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "telegram_moderation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_moderation_incidents_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_moderation_incidents_telegram_chat_id_fkey"
            columns: ["telegram_chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_moderation_rules: {
        Row: {
          action_type: Database["public"]["Enums"]["telegram_moderation_action_type"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_enabled: boolean
          metadata: Json
          rule_key: string
          telegram_chat_id: string
          threshold_count: number
          title: string
          updated_at: string
          window_seconds: number | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["telegram_moderation_action_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json
          rule_key: string
          telegram_chat_id: string
          threshold_count?: number
          title: string
          updated_at?: string
          window_seconds?: number | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["telegram_moderation_action_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json
          rule_key?: string
          telegram_chat_id?: string
          threshold_count?: number
          title?: string
          updated_at?: string
          window_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_moderation_rules_telegram_chat_id_fkey"
            columns: ["telegram_chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_notification_routes: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          metadata: Json
          notify_on_boost: boolean
          notify_on_live_end: boolean
          notify_on_live_start: boolean
          notify_on_moderation: boolean
          notify_on_post: boolean
          notify_on_raid: boolean
          route_type: Database["public"]["Enums"]["telegram_route_type"]
          streamer_id: string | null
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json
          notify_on_boost?: boolean
          notify_on_live_end?: boolean
          notify_on_live_start?: boolean
          notify_on_moderation?: boolean
          notify_on_post?: boolean
          notify_on_raid?: boolean
          route_type: Database["public"]["Enums"]["telegram_route_type"]
          streamer_id?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json
          notify_on_boost?: boolean
          notify_on_live_end?: boolean
          notify_on_live_start?: boolean
          notify_on_moderation?: boolean
          notify_on_post?: boolean
          notify_on_raid?: boolean
          route_type?: Database["public"]["Enums"]["telegram_route_type"]
          streamer_id?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_notification_routes_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_notification_routes_telegram_chat_id_fkey"
            columns: ["telegram_chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_notification_targets: {
        Row: {
          attempted_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json
          notification_id: string | null
          payload: Json
          provider_message_id: string | null
          route_id: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          streamer_id: string | null
          telegram_chat_id: string | null
          telegram_link_id: string | null
          user_id: string | null
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          notification_id?: string | null
          payload?: Json
          provider_message_id?: string | null
          route_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          streamer_id?: string | null
          telegram_chat_id?: string | null
          telegram_link_id?: string | null
          user_id?: string | null
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          notification_id?: string | null
          payload?: Json
          provider_message_id?: string | null
          route_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          streamer_id?: string | null
          telegram_chat_id?: string | null
          telegram_link_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_notification_targets_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_notification_targets_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "telegram_notification_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_notification_targets_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_notification_targets_telegram_chat_id_fkey"
            columns: ["telegram_chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_notification_targets_telegram_link_id_fkey"
            columns: ["telegram_link_id"]
            isOneToOne: false
            referencedRelation: "telegram_links"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      viewer_achievement_unlocks: {
        Row: {
          achievement_key: string
          created_at: string
          description: string | null
          id: string
          metadata: Json
          reward_points: number
          reward_team_points: number
          stream_session_id: string | null
          streamer_id: string
          title: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          reward_points?: number
          reward_team_points?: number
          stream_session_id?: string | null
          streamer_id: string
          title: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          reward_points?: number
          reward_team_points?: number
          stream_session_id?: string | null
          streamer_id?: string
          title?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viewer_achievement_unlocks_stream_session_id_fkey"
            columns: ["stream_session_id"]
            isOneToOne: false
            referencedRelation: "stream_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewer_achievement_unlocks_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
      viewer_points_ledger: {
        Row: {
          balance_after: number | null
          created_at: string
          delta: number
          id: string
          metadata: Json
          reason: string | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          reason?: string | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          reason?: string | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      viewer_stream_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["viewer_action_type"]
          created_at: string
          id: string
          metadata: Json
          occurred_at: string
          points_awarded: number
          stream_session_id: string | null
          streamer_id: string
          user_id: string
          watch_seconds: number
        }
        Insert: {
          action_type: Database["public"]["Enums"]["viewer_action_type"]
          created_at?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          points_awarded?: number
          stream_session_id?: string | null
          streamer_id: string
          user_id: string
          watch_seconds?: number
        }
        Update: {
          action_type?: Database["public"]["Enums"]["viewer_action_type"]
          created_at?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          points_awarded?: number
          stream_session_id?: string | null
          streamer_id?: string
          user_id?: string
          watch_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "viewer_stream_actions_stream_session_id_fkey"
            columns: ["stream_session_id"]
            isOneToOne: false
            referencedRelation: "stream_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewer_stream_actions_streamer_id_fkey"
            columns: ["streamer_id"]
            isOneToOne: false
            referencedRelation: "streamers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_claim_streamer: { Args: { _streamer_id: string }; Returns: boolean }
      can_receive_streamer_telegram: {
        Args: { _streamer_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_streamer: { Args: { _streamer_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "streamer" | "viewer"
      boost_status: "active" | "expired" | "cancelled"
      content_post_type: "news" | "announcement" | "video" | "update"
      donation_status: "pending" | "succeeded" | "failed"
      delivery_status: "pending" | "sent" | "failed" | "cancelled"
      media_type: "image" | "video" | "tiktok_clip" | "external_link"
      notification_channel: "in_app" | "telegram" | "web_push"
      post_reaction_type: "nova" | "flare" | "pulse" | "crown"
      promotion_order_status: "pending" | "submitted" | "failed" | "cancelled"
      stream_event_type:
        | "live_started"
        | "live_ended"
        | "viewer_joined"
        | "viewer_left"
        | "like_received"
        | "gift_received"
        | "chat_message"
        | "snapshot_updated"
        | "code_word_submitted"
        | "boost_started"
        | "boost_expired"
        | "raid_requested"
      stream_session_status: "live" | "ended" | "failed"
      streamer_verification_status: "pending" | "verified" | "rejected"
      subscription_plan_key: "free" | "supporter" | "superfan" | "legend"
      task_type: "visit" | "code" | "boost" | "referral"
      telegram_chat_kind:
        | "platform_group"
        | "platform_channel"
        | "streamer_group"
        | "streamer_channel"
      telegram_member_role: "owner" | "admin" | "moderator" | "member" | "bot"
      telegram_moderation_action_type:
        | "warn"
        | "delete_message"
        | "mute"
        | "ban"
        | "unban"
        | "restrict_media"
        | "restrict_links"
        | "approve_join"
      telegram_moderation_status:
        | "pending"
        | "applied"
        | "failed"
        | "reverted"
        | "cancelled"
      telegram_route_type: "platform_chat" | "streamer_chat" | "subscriber_dm"
      viewer_action_type:
        | "stream_visit"
        | "watch_time"
        | "code_submission"
        | "boost_participation"
        | "like"
        | "gift"
        | "chat_message"
        | "referral_join"
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
      app_role: ["admin", "streamer", "viewer"],
      boost_status: ["active", "expired", "cancelled"],
      content_post_type: ["news", "announcement", "video", "update"],
      donation_status: ["pending", "succeeded", "failed"],
      delivery_status: ["pending", "sent", "failed", "cancelled"],
      media_type: ["image", "video", "tiktok_clip", "external_link"],
      notification_channel: ["in_app", "telegram", "web_push"],
      post_reaction_type: ["nova", "flare", "pulse", "crown"],
      promotion_order_status: ["pending", "submitted", "failed", "cancelled"],
      stream_event_type: [
        "live_started",
        "live_ended",
        "viewer_joined",
        "viewer_left",
        "like_received",
        "gift_received",
        "chat_message",
        "snapshot_updated",
        "code_word_submitted",
        "boost_started",
        "boost_expired",
        "raid_requested",
      ],
      stream_session_status: ["live", "ended", "failed"],
      streamer_verification_status: ["pending", "verified", "rejected"],
      subscription_plan_key: ["free", "supporter", "superfan", "legend"],
      task_type: ["visit", "code", "boost", "referral"],
      telegram_chat_kind: [
        "platform_group",
        "platform_channel",
        "streamer_group",
        "streamer_channel",
      ],
      telegram_member_role: ["owner", "admin", "moderator", "member", "bot"],
      telegram_moderation_action_type: [
        "warn",
        "delete_message",
        "mute",
        "ban",
        "unban",
        "restrict_media",
        "restrict_links",
        "approve_join",
      ],
      telegram_moderation_status: [
        "pending",
        "applied",
        "failed",
        "reverted",
        "cancelled",
      ],
      telegram_route_type: ["platform_chat", "streamer_chat", "subscriber_dm"],
      viewer_action_type: [
        "stream_visit",
        "watch_time",
        "code_submission",
        "boost_participation",
        "like",
        "gift",
        "chat_message",
        "referral_join",
      ],
    },
  },
} as const
