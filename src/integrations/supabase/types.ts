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
      attendance_records: {
        Row: {
          id: string
          marked_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          marked_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          marked_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_open: boolean
          location: string | null
          session_date: string
          session_time: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_open?: boolean
          location?: string | null
          session_date: string
          session_time?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_open?: boolean
          location?: string | null
          session_date?: string
          session_time?: string | null
          title?: string
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          callee_id: string
          caller_id: string
          created_at: string
          duration_sec: number | null
          ended_at: string | null
          id: string
          kind: string
          started_at: string | null
          status: string
        }
        Insert: {
          callee_id: string
          caller_id: string
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          kind: string
          started_at?: string | null
          status?: string
        }
        Update: {
          callee_id?: string
          caller_id?: string
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          kind?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      call_signals: {
        Row: {
          created_at: string
          from_user: string
          id: string
          payload: Json
          session_id: string
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          payload: Json
          session_id: string
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          payload?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_preferences: {
        Row: {
          background_url: string | null
          doodle_enabled: boolean
          id: string
          peer_id: string | null
          preset_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          background_url?: string | null
          doodle_enabled?: boolean
          id?: string
          peer_id?: string | null
          preset_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          background_url?: string | null
          doodle_enabled?: boolean
          id?: string
          peer_id?: string | null
          preset_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      communities: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_invites: {
        Row: {
          community_id: string
          created_at: string
          id: string
          invited_by: string
          invited_user_id: string
          status: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          invited_by: string
          invited_user_id: string
          status?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_invites_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_milestones: {
        Row: {
          achieved_at: string
          id: string
          kind: string
          user_id: string
          value: number
        }
        Insert: {
          achieved_at?: string
          id?: string
          kind: string
          user_id: string
          value: number
        }
        Update: {
          achieved_at?: string
          id?: string
          kind?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          media_mime: string | null
          media_name: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          read: boolean
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          media_mime?: string | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          read?: boolean
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          media_mime?: string | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          read?: boolean
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          status?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      gallery: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          image_url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url?: string
        }
        Relationships: []
      }
      live_sessions: {
        Row: {
          community_id: string | null
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          kind: string
          room_url: string | null
          started_at: string | null
          starts_at: string | null
          title: string
        }
        Insert: {
          community_id?: string | null
          created_at?: string
          ended_at?: string | null
          host_id: string
          id?: string
          kind?: string
          room_url?: string | null
          started_at?: string | null
          starts_at?: string | null
          title: string
        }
        Update: {
          community_id?: string | null
          created_at?: string
          ended_at?: string | null
          host_id?: string
          id?: string
          kind?: string
          room_url?: string | null
          started_at?: string | null
          starts_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      memes_cache: {
        Row: {
          external_id: string
          fetched_at: string
          id: string
          image_url: string
          source: string | null
          title: string | null
        }
        Insert: {
          external_id: string
          fetched_at?: string
          id?: string
          image_url: string
          source?: string | null
          title?: string | null
        }
        Update: {
          external_id?: string
          fetched_at?: string
          id?: string
          image_url?: string
          source?: string | null
          title?: string | null
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          category: string
          fetched_at: string
          id: string
          image_url: string | null
          published_at: string | null
          source: string
          summary: string | null
          title: string
          url: string
        }
        Insert: {
          category?: string
          fetched_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source: string
          summary?: string | null
          title: string
          url: string
        }
        Update: {
          category?: string
          fetched_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source?: string
          summary?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      news_cache: {
        Row: {
          category: string
          description: string | null
          fetched_at: string
          id: string
          image_url: string | null
          published_at: string | null
          source: string | null
          title: string
          url: string
        }
        Insert: {
          category: string
          description?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source?: string | null
          title: string
          url: string
        }
        Update: {
          category?: string
          description?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      notification_dispatch_logs: {
        Row: {
          body: string | null
          channel: string | null
          created_at: string
          error: string | null
          id: string
          onesignal_id: string | null
          raw_response: Json | null
          recipients: number | null
          request_payload: Json | null
          status: string
          target_type: string | null
          target_value: Json | null
          title: string | null
          user_ids: string[] | null
        }
        Insert: {
          body?: string | null
          channel?: string | null
          created_at?: string
          error?: string | null
          id?: string
          onesignal_id?: string | null
          raw_response?: Json | null
          recipients?: number | null
          request_payload?: Json | null
          status?: string
          target_type?: string | null
          target_value?: Json | null
          title?: string | null
          user_ids?: string[] | null
        }
        Update: {
          body?: string | null
          channel?: string | null
          created_at?: string
          error?: string | null
          id?: string
          onesignal_id?: string | null
          raw_response?: Json | null
          recipients?: number | null
          request_payload?: Json | null
          status?: string
          target_type?: string | null
          target_value?: Json | null
          title?: string | null
          user_ids?: string[] | null
        }
        Relationships: []
      }
      notification_group_queue: {
        Row: {
          actor_id: string | null
          body: string
          created_at: string
          data: Json
          flush_at: string
          flushed_at: string | null
          group_key: string
          id: string
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body: string
          created_at?: string
          data?: Json
          flush_at?: string
          flushed_at?: string | null
          group_key: string
          id?: string
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          created_at?: string
          data?: Json
          flush_at?: string
          flushed_at?: string | null
          group_key?: string
          id?: string
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string
          clicked_at: string | null
          created_at: string
          data: Json
          dedupe_id: string | null
          delivered_at: string | null
          entity_id: string | null
          entity_type: string | null
          group_key: string | null
          id: string
          kind: string
          read: boolean
          read_at: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body: string
          clicked_at?: string | null
          created_at?: string
          data?: Json
          dedupe_id?: string | null
          delivered_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          group_key?: string | null
          id?: string
          kind?: string
          read?: boolean
          read_at?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          clicked_at?: string | null
          created_at?: string
          data?: Json
          dedupe_id?: string | null
          delivered_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          group_key?: string | null
          id?: string
          kind?: string
          read?: boolean
          read_at?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          quote_content: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          quote_content?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          quote_content?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          image_url: string | null
          type: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          type?: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          type?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      prayer_interactions: {
        Row: {
          created_at: string | null
          id: string
          prayer_request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          prayer_request_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          prayer_request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_interactions_prayer_request_id_fkey"
            columns: ["prayer_request_id"]
            isOneToOne: false
            referencedRelation: "prayer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_requests: {
        Row: {
          created_at: string | null
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          phone_number: string | null
          profile_image_url: string | null
          theme_preference: string | null
          tour_completed: boolean
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id: string
          phone_number?: string | null
          profile_image_url?: string | null
          theme_preference?: string | null
          tour_completed?: boolean
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone_number?: string | null
          profile_image_url?: string | null
          theme_preference?: string | null
          tour_completed?: boolean
        }
        Relationships: []
      }
      resources: {
        Row: {
          created_at: string | null
          description: string | null
          file_url: string
          id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_url: string
          id?: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_url?: string
          id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      scheduled_notifications: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          segment: Json
          send_at: string
          sent_at: string | null
          status: string
          title: string
          url: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          segment?: Json
          send_at: string
          sent_at?: string | null
          status?: string
          title: string
          url?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          segment?: Json
          send_at?: string
          sent_at?: string | null
          status?: string
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      stories: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          media_type: string
          media_url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url?: string
          user_id?: string
        }
        Relationships: []
      }
      story_reactions: {
        Row: {
          created_at: string
          id: string
          reaction: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_reactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          created_at: string
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_type: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_type: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string | null
          expiration_time: number | null
          failure_count: number
          id: string
          last_seen_at: string | null
          p256dh: string | null
          platform: string
          player_id: string | null
          revoked_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint?: string | null
          expiration_time?: number | null
          failure_count?: number
          id?: string
          last_seen_at?: string | null
          p256dh?: string | null
          platform?: string
          player_id?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string | null
          expiration_time?: number | null
          failure_count?: number
          id?: string
          last_seen_at?: string | null
          p256dh?: string | null
          platform?: string
          player_id?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          last_login_date: string | null
          login_streak: number
          points: number
          total_amens_received: number
          total_posts: number
          total_prayers: number
          updated_at: string
          user_id: string
        }
        Insert: {
          last_login_date?: string | null
          login_streak?: number
          points?: number
          total_amens_received?: number
          total_posts?: number
          total_prayers?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          last_login_date?: string | null
          login_streak?: number
          points?: number
          total_amens_received?: number
          total_posts?: number
          total_prayers?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      enqueue_notification: {
        Args: {
          _actor_id: string
          _body: string
          _data: Json
          _dedupe_id: string
          _entity_id: string
          _entity_type: string
          _group_key: string
          _kind: string
          _title: string
          _url: string
          _user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_push_broadcast: {
        Args: { _body: string; _data: Json; _title: string }
        Returns: undefined
      }
      invoke_push_to_user: {
        Args: { _body: string; _data: Json; _title: string; _user_id: string }
        Returns: undefined
      }
      is_community_admin: {
        Args: { _community_id: string; _user_id: string }
        Returns: boolean
      }
      notify_users: {
        Args: {
          _body: string
          _data: Json
          _title: string
          _user_ids: string[]
        }
        Returns: undefined
      }
      record_daily_login: {
        Args: { _user_id: string }
        Returns: {
          awarded_badge: string
          points: number
          streak: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
