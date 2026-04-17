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
          last_live_at: string | null
          last_checked_live_at: string | null
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
          last_live_at?: string | null
          last_checked_live_at?: string | null
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
          last_live_at?: string | null
          last_checked_live_at?: string | null
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
          cover_url: string | null
          created_at: string
          external_url: string | null
          id: string
          is_published: boolean
          post_type: Database["public"]["Enums"]["content_post_type"]
          published_at: string | null
          streamer_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_user_id?: string | null
          body?: string | null
          cover_url?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          is_published?: boolean
          post_type?: Database["public"]["Enums"]["content_post_type"]
          published_at?: string | null
          streamer_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string | null
          body?: string | null
          cover_url?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          is_published?: boolean
          post_type?: Database["public"]["Enums"]["content_post_type"]
          published_at?: string | null
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
          streamer_id: string
          telegram_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_enabled?: boolean
          streamer_id: string
          telegram_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_enabled?: boolean
          streamer_id?: string
          telegram_enabled?: boolean
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
          code: string | null
          created_at: string
          description: string | null
          id: string
          reward_points: number
          streamer_id: string | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reward_points?: number
          streamer_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reward_points?: number
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
      owns_streamer: {
        Args: {
          _streamer_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "streamer" | "viewer"
      boost_status: "active" | "expired" | "cancelled"
      content_post_type: "news" | "announcement" | "video" | "update"
      delivery_status: "pending" | "sent" | "failed" | "cancelled"
      media_type: "image" | "video" | "tiktok_clip" | "external_link"
      notification_channel: "in_app" | "telegram" | "web_push"
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
      task_type: "visit" | "code" | "boost" | "referral"
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
      task_type: ["visit", "code", "boost", "referral"],
    },
  },
} as const
