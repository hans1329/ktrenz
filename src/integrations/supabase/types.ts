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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_activity_log: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          user_agent_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          user_agent_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          user_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_log_user_agent_id_fkey"
            columns: ["user_agent_id"]
            isOneToOne: false
            referencedRelation: "user_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_messages: {
        Row: {
          agent_persona_id: string | null
          created_at: string
          id: string
          message: string
          metadata: Json | null
          onchain_batch_hash: string | null
          onchain_tx_hash: string | null
          sender_type: string
          status: string
          topic_type: string | null
          user_id: string | null
        }
        Insert: {
          agent_persona_id?: string | null
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          onchain_batch_hash?: string | null
          onchain_tx_hash?: string | null
          sender_type: string
          status?: string
          topic_type?: string | null
          user_id?: string | null
        }
        Update: {
          agent_persona_id?: string | null
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          onchain_batch_hash?: string | null
          onchain_tx_hash?: string | null
          sender_type?: string
          status?: string
          topic_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_agent_persona_id_fkey"
            columns: ["agent_persona_id"]
            isOneToOne: false
            referencedRelation: "agent_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_settings: {
        Row: {
          id: string
          interval_minutes: number
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          interval_minutes?: number
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          interval_minutes?: number
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      agent_daily_usage: {
        Row: {
          agent_id: string
          buy_count: number
          created_at: string
          id: string
          sell_count: number
          total_fees_usd: number
          total_volume_usd: number
          transaction_count: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          agent_id: string
          buy_count?: number
          created_at?: string
          id?: string
          sell_count?: number
          total_fees_usd?: number
          total_volume_usd?: number
          transaction_count?: number
          updated_at?: string
          usage_date?: string
        }
        Update: {
          agent_id?: string
          buy_count?: number
          created_at?: string
          id?: string
          sell_count?: number
          total_fees_usd?: number
          total_volume_usd?: number
          transaction_count?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_daily_usage_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "verified_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_personas: {
        Row: {
          avatar_emoji: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          favorite_artist_id: string | null
          id: string
          is_active: boolean
          name: string
          personality: string
        }
        Insert: {
          avatar_emoji?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          favorite_artist_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          personality?: string
        }
        Update: {
          avatar_emoji?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          favorite_artist_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          personality?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_personas_favorite_artist_id_fkey"
            columns: ["favorite_artist_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_transactions: {
        Row: {
          agent_id: string
          block_number: number | null
          created_at: string
          fanz_token_id: string | null
          fee_usdc: number
          id: string
          price_usdc: number
          status: string
          token_amount: number
          total_usdc: number
          tx_hash: string
          tx_type: string
        }
        Insert: {
          agent_id: string
          block_number?: number | null
          created_at?: string
          fanz_token_id?: string | null
          fee_usdc?: number
          id?: string
          price_usdc: number
          status?: string
          token_amount?: number
          total_usdc: number
          tx_hash: string
          tx_type: string
        }
        Update: {
          agent_id?: string
          block_number?: number | null
          created_at?: string
          fanz_token_id?: string | null
          fee_usdc?: number
          id?: string
          price_usdc?: number
          status?: string
          token_amount?: number
          total_usdc?: number
          tx_hash?: string
          tx_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "verified_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_transactions_fanz_token_id_fkey"
            columns: ["fanz_token_id"]
            isOneToOne: false
            referencedRelation: "fanz_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_data_contributions: {
        Row: {
          ai_model_version: string | null
          content_id: string
          content_type: string
          contribution_quality_score: number
          created_at: string
          id: string
          reward_amount: number | null
          training_date: string | null
          updated_at: string
          used_in_training: boolean
          user_id: string
        }
        Insert: {
          ai_model_version?: string | null
          content_id: string
          content_type: string
          contribution_quality_score?: number
          created_at?: string
          id?: string
          reward_amount?: number | null
          training_date?: string | null
          updated_at?: string
          used_in_training?: boolean
          user_id: string
        }
        Update: {
          ai_model_version?: string | null
          content_id?: string
          content_type?: string
          contribution_quality_score?: number
          created_at?: string
          id?: string
          reward_amount?: number | null
          training_date?: string | null
          updated_at?: string
          used_in_training?: boolean
          user_id?: string
        }
        Relationships: []
      }
      artist_community_funds: {
        Row: {
          id: string
          total_fund_usdc: number
          total_throws: number
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          id?: string
          total_fund_usdc?: number
          total_throws?: number
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          id?: string
          total_fund_usdc?: number
          total_throws?: number
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_community_funds_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_fan_tiers: {
        Row: {
          created_at: string
          id: string
          tier: string
          total_thrown: number
          updated_at: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tier?: string
          total_thrown?: number
          updated_at?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tier?: string
          total_thrown?: number
          updated_at?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_fan_tiers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_fan_tiers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_fan_tiers_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_listing_requests: {
        Row: {
          artist_name: string
          created_at: string
          id: string
          instagram_url: string | null
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tiktok_url: string | null
          updated_at: string
          user_id: string
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          artist_name: string
          created_at?: string
          id?: string
          instagram_url?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tiktok_url?: string | null
          updated_at?: string
          user_id: string
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          artist_name?: string
          created_at?: string
          id?: string
          instagram_url?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tiktok_url?: string | null
          updated_at?: string
          user_id?: string
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          requirement_count: number | null
          requirement_type: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          requirement_count?: number | null
          requirement_type: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          requirement_count?: number | null
          requirement_type?: string
        }
        Relationships: []
      }
      blocked_email_domains: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_user_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_agents: {
        Row: {
          api_key: string
          api_key_hash: string
          created_at: string
          daily_limit_usd: number
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          api_key: string
          api_key_hash: string
          created_at?: string
          daily_limit_usd?: number
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          api_key?: string
          api_key_hash?: string
          created_at?: string
          daily_limit_usd?: number
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      bot_transactions: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          error_message: string | null
          fanz_token_id: string
          fee_usdc: number
          id: string
          price_usdc: number
          status: string
          total_cost_usdc: number
          transaction_type: string
          tx_hash: string | null
        }
        Insert: {
          agent_id: string
          amount?: number
          created_at?: string
          error_message?: string | null
          fanz_token_id: string
          fee_usdc?: number
          id?: string
          price_usdc: number
          status?: string
          total_cost_usdc: number
          transaction_type: string
          tx_hash?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          error_message?: string | null
          fanz_token_id?: string
          fee_usdc?: number
          id?: string
          price_usdc?: number
          status?: string
          total_cost_usdc?: number
          transaction_type?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "bot_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          is_recurring: boolean
          metadata: Json | null
          reference_id: string | null
          title: string
          updated_at: string
          wiki_entry_id: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          is_recurring?: boolean
          metadata?: Json | null
          reference_id?: string | null
          title: string
          updated_at?: string
          wiki_entry_id?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          is_recurring?: boolean
          metadata?: Json | null
          reference_id?: string | null
          title?: string
          updated_at?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participations: {
        Row: {
          answer: string
          challenge_id: string
          claimed_at: string | null
          created_at: string
          has_lightstick: boolean
          id: string
          is_winner: boolean | null
          prize_amount: number | null
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          answer: string
          challenge_id: string
          claimed_at?: string | null
          created_at?: string
          has_lightstick?: boolean
          id?: string
          is_winner?: boolean | null
          prize_amount?: number | null
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          answer?: string
          challenge_id?: string
          claimed_at?: string | null
          created_at?: string
          has_lightstick?: boolean
          id?: string
          is_winner?: boolean | null
          prize_amount?: number | null
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participations_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_wiki_entries: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          wiki_entry_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          wiki_entry_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_wiki_entries_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_wiki_entries_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          answer_fetch_time: string | null
          claim_end_time: string | null
          claim_start_time: string | null
          correct_answer: string
          created_at: string
          created_by: string
          end_time: string
          entry_cost: number
          hide_prize_pool: boolean | null
          id: string
          image_url: string | null
          onchain_challenge_id: number | null
          options: Json | null
          prize_with_lightstick: number
          prize_without_lightstick: number
          question: string
          selected_at: string | null
          selection_block_hash: string | null
          selection_block_number: number | null
          selection_seed: string | null
          selection_tx_hash: string | null
          start_time: string
          status: string
          total_prize_usdc: number
          updated_at: string
          wiki_entry_id: string | null
          winner_count: number
        }
        Insert: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          answer_fetch_time?: string | null
          claim_end_time?: string | null
          claim_start_time?: string | null
          correct_answer: string
          created_at?: string
          created_by: string
          end_time: string
          entry_cost?: number
          hide_prize_pool?: boolean | null
          id?: string
          image_url?: string | null
          onchain_challenge_id?: number | null
          options?: Json | null
          prize_with_lightstick?: number
          prize_without_lightstick?: number
          question: string
          selected_at?: string | null
          selection_block_hash?: string | null
          selection_block_number?: number | null
          selection_seed?: string | null
          selection_tx_hash?: string | null
          start_time?: string
          status?: string
          total_prize_usdc?: number
          updated_at?: string
          wiki_entry_id?: string | null
          winner_count?: number
        }
        Update: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          answer_fetch_time?: string | null
          claim_end_time?: string | null
          claim_start_time?: string | null
          correct_answer?: string
          created_at?: string
          created_by?: string
          end_time?: string
          entry_cost?: number
          hide_prize_pool?: boolean | null
          id?: string
          image_url?: string | null
          onchain_challenge_id?: number | null
          options?: Json | null
          prize_with_lightstick?: number
          prize_without_lightstick?: number
          question?: string
          selected_at?: string | null
          selection_block_hash?: string | null
          selection_block_number?: number | null
          selection_seed?: string | null
          selection_tx_hash?: string | null
          start_time?: string
          status?: string
          total_prize_usdc?: number
          updated_at?: string
          wiki_entry_id?: string | null
          winner_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenges_admin_approved_by_fkey"
            columns: ["admin_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_admin_approved_by_fkey"
            columns: ["admin_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_votes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          vote_type?: Database["public"]["Enums"]["vote_type"]
        }
        Relationships: [
          {
            foreignKeyName: "comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string | null
          updated_at: string
          user_id: string
          votes: number
          wiki_entry_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string | null
          updated_at?: string
          user_id: string
          votes?: number
          wiki_entry_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string | null
          updated_at?: string
          user_id?: string
          votes?: number
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          banner_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          icon_url: string | null
          id: string
          is_verified: boolean
          member_count: number
          name: string
          post_count: number
          slug: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_verified?: boolean
          member_count?: number
          name: string
          post_count?: number
          slug: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_verified?: boolean
          member_count?: number
          name?: string
          post_count?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          community_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          community_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          community_id?: string
          id?: string
          joined_at?: string
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
      community_rules: {
        Row: {
          community_id: string
          created_at: string
          description: string | null
          id: string
          rule_order: number
          title: string
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          description?: string | null
          id?: string
          rule_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          description?: string | null
          id?: string
          rule_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_rules_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          updated_at: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          updated_at?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          updated_at?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: []
      }
      creator_earnings: {
        Row: {
          amount: number
          badge_id: string
          created_at: string
          creator_id: string
          giver_user_id: string
          id: string
          percentage: number
          wiki_entry_id: string
        }
        Insert: {
          amount: number
          badge_id: string
          created_at?: string
          creator_id: string
          giver_user_id: string
          id?: string
          percentage?: number
          wiki_entry_id: string
        }
        Update: {
          amount?: number
          badge_id?: string
          created_at?: string
          creator_id?: string
          giver_user_id?: string
          id?: string
          percentage?: number
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_earnings_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "gift_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_post_counts: {
        Row: {
          created_at: string | null
          id: string
          post_count: number
          post_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_count?: number
          post_date?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_count?: number
          post_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_vote_counts: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          vote_count: number
          vote_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          vote_count?: number
          vote_date?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          vote_count?: number
          vote_date?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_community_funds: {
        Row: {
          created_at: string
          id: string
          total_fund: number
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          total_fund?: number
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          total_fund?: number
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_community_funds_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_fund_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          fanz_transaction_id: string | null
          id: string
          transaction_type: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          fanz_transaction_id?: string | null
          id?: string
          transaction_type: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          fanz_transaction_id?: string | null
          id?: string
          transaction_type?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_fund_transactions_fanz_transaction_id_fkey"
            columns: ["fanz_transaction_id"]
            isOneToOne: false
            referencedRelation: "fanz_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_fund_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_fund_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_fund_transactions_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      external_challenge_participations: {
        Row: {
          answer: string
          challenge_id: string
          claimed_at: string | null
          created_at: string | null
          external_wallet_id: string
          has_lightstick: boolean
          id: string
          is_winner: boolean | null
          prize_amount: number | null
          prize_tx_hash: string | null
        }
        Insert: {
          answer: string
          challenge_id: string
          claimed_at?: string | null
          created_at?: string | null
          external_wallet_id: string
          has_lightstick?: boolean
          id?: string
          is_winner?: boolean | null
          prize_amount?: number | null
          prize_tx_hash?: string | null
        }
        Update: {
          answer?: string
          challenge_id?: string
          claimed_at?: string | null
          created_at?: string | null
          external_wallet_id?: string
          has_lightstick?: boolean
          id?: string
          is_winner?: boolean | null
          prize_amount?: number | null
          prize_tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_challenge_participations_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_challenge_participations_external_wallet_id_fkey"
            columns: ["external_wallet_id"]
            isOneToOne: false
            referencedRelation: "external_wallet_users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_wallet_profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          source: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          source?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          source?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_wallet_profiles_public_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "external_wallet_users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_wallet_users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          fid: number | null
          id: string
          linked_user_id: string | null
          source: string
          updated_at: string | null
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          fid?: number | null
          id?: string
          linked_user_id?: string | null
          source?: string
          updated_at?: string | null
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          fid?: number | null
          id?: string
          linked_user_id?: string | null
          source?: string
          updated_at?: string | null
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_wallet_users_linked_user_id_fkey"
            columns: ["linked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_wallet_users_linked_user_id_fkey"
            columns: ["linked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      fanz_balances: {
        Row: {
          balance: number
          created_at: string
          fanz_token_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          fanz_token_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          fanz_token_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fanz_balances_fanz_token_id_fkey"
            columns: ["fanz_token_id"]
            isOneToOne: false
            referencedRelation: "fanz_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fanz_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fanz_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      fanz_tokens: {
        Row: {
          base_price: number
          bot_contract_registered: boolean | null
          buy_fee_creator_percent: number
          buy_fee_platform_percent: number
          contract_address: string | null
          created_at: string
          creator_id: string
          id: string
          is_active: boolean
          k_value: number
          post_id: string | null
          sell_fee_percent: number
          token_id: string
          total_supply: number
          updated_at: string
          wiki_entry_id: string | null
        }
        Insert: {
          base_price?: number
          bot_contract_registered?: boolean | null
          buy_fee_creator_percent?: number
          buy_fee_platform_percent?: number
          contract_address?: string | null
          created_at?: string
          creator_id: string
          id?: string
          is_active?: boolean
          k_value?: number
          post_id?: string | null
          sell_fee_percent?: number
          token_id: string
          total_supply?: number
          updated_at?: string
          wiki_entry_id?: string | null
        }
        Update: {
          base_price?: number
          bot_contract_registered?: boolean | null
          buy_fee_creator_percent?: number
          buy_fee_platform_percent?: number
          contract_address?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          is_active?: boolean
          k_value?: number
          post_id?: string | null
          sell_fee_percent?: number
          token_id?: string
          total_supply?: number
          updated_at?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fanz_tokens_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fanz_tokens_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fanz_tokens_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fanz_tokens_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fanz_transactions: {
        Row: {
          amount: number
          created_at: string
          creator_fee: number
          fanz_token_id: string
          id: string
          payment_token: string
          payment_value: number
          platform_fee: number
          price_per_token: number
          stripe_payment_intent_id: string | null
          total_value: number
          transaction_type: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          creator_fee?: number
          fanz_token_id: string
          id?: string
          payment_token?: string
          payment_value: number
          platform_fee?: number
          price_per_token: number
          stripe_payment_intent_id?: string | null
          total_value: number
          transaction_type: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          creator_fee?: number
          fanz_token_id?: string
          id?: string
          payment_token?: string
          payment_value?: number
          platform_fee?: number
          price_per_token?: number
          stripe_payment_intent_id?: string | null
          total_value?: number
          transaction_type?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fanz_transactions_fanz_token_id_fkey"
            columns: ["fanz_token_id"]
            isOneToOne: false
            referencedRelation: "fanz_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fanz_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fanz_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gas_vouchers: {
        Row: {
          auth_provider: string
          auth_provider_id: string
          created_at: string
          daily_limit_usd: number
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          user_id: string
          voucher_code: string
        }
        Insert: {
          auth_provider: string
          auth_provider_id: string
          created_at?: string
          daily_limit_usd?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          user_id: string
          voucher_code: string
        }
        Update: {
          auth_provider?: string
          auth_provider_id?: string
          created_at?: string
          daily_limit_usd?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          user_id?: string
          voucher_code?: string
        }
        Relationships: []
      }
      gift_badges: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          icon: string
          id: string
          is_active: boolean
          name: string
          point_price: number | null
          stripe_price_id: string | null
          usd_price: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon: string
          id?: string
          is_active?: boolean
          name: string
          point_price?: number | null
          stripe_price_id?: string | null
          usd_price?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          point_price?: number | null
          stripe_price_id?: string | null
          usd_price?: number
        }
        Relationships: []
      }
      homework_completions: {
        Row: {
          completed_at: string
          energy_cost: number
          homework_content_id: string
          id: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          completed_at?: string
          energy_cost?: number
          homework_content_id: string
          id?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          completed_at?: string
          energy_cost?: number
          homework_content_id?: string
          id?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_completions_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_contents: {
        Row: {
          content_type: string
          created_at: string
          description: string | null
          display_date: string
          display_order: number
          id: string
          is_active: boolean
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string
          wiki_entry_id: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          description?: string | null
          display_date?: string
          display_order?: number
          id?: string
          is_active?: boolean
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url: string
          wiki_entry_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          description?: string | null
          display_date?: string
          display_order?: number
          id?: string
          is_active?: boolean
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_contents_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_code_uses: {
        Row: {
          id: string
          invitation_code_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          id?: string
          invitation_code_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          id?: string
          invitation_code_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_code_uses_invitation_code_id_fkey"
            columns: ["invitation_code_id"]
            isOneToOne: false
            referencedRelation: "invitation_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_codes: {
        Row: {
          code: string
          created_at: string
          creator_id: string
          current_uses: number
          id: string
          max_uses: number
          used_at: string | null
          used_by: string | null
          wiki_entry_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          creator_id: string
          current_uses?: number
          id?: string
          max_uses?: number
          used_at?: string | null
          used_by?: string | null
          wiki_entry_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          creator_id?: string
          current_uses?: number
          id?: string
          max_uses?: number
          used_at?: string | null
          used_by?: string | null
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_codes_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_rate_limits: {
        Row: {
          action_type: string
          created_at: string
          id: string
          ip_hash: string
          reference_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          ip_hash: string
          reference_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          ip_hash?: string
          reference_id?: string | null
        }
        Relationships: []
      }
      kpass_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          started_at: string
          status: string
          tier_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tier_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tier_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpass_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "kpass_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      kpass_tiers: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          features: Json | null
          icon: string | null
          id: number
          is_active: boolean
          monthly_price_usd: number
          name: string
          name_ko: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          features?: Json | null
          icon?: string | null
          id?: number
          is_active?: boolean
          monthly_price_usd?: number
          name: string
          name_ko: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          features?: Json | null
          icon?: string | null
          id?: number
          is_active?: boolean
          monthly_price_usd?: number
          name?: string
          name_ko?: string
          sort_order?: number
        }
        Relationships: []
      }
      ktrenz_agent_daily_usage: {
        Row: {
          bonus_remaining: number
          created_at: string
          id: string
          message_count: number
          points_spent: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          bonus_remaining?: number
          created_at?: string
          id?: string
          message_count?: number
          points_spent?: number
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          bonus_remaining?: number
          created_at?: string
          id?: string
          message_count?: number
          points_spent?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      ktrenz_agent_intent_summaries: {
        Row: {
          id: string
          intent_category: string
          query_count: number | null
          sample_queries: Json | null
          sentiment_distribution: Json | null
          summary_date: string
          trending_score: number | null
          unique_users: number | null
          updated_at: string | null
          wiki_entry_id: string
        }
        Insert: {
          id?: string
          intent_category: string
          query_count?: number | null
          sample_queries?: Json | null
          sentiment_distribution?: Json | null
          summary_date?: string
          trending_score?: number | null
          unique_users?: number | null
          updated_at?: string | null
          wiki_entry_id: string
        }
        Update: {
          id?: string
          intent_category?: string
          query_count?: number | null
          sample_queries?: Json | null
          sentiment_distribution?: Json | null
          summary_date?: string
          trending_score?: number | null
          unique_users?: number | null
          updated_at?: string | null
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_agent_intent_summaries_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_agent_intents: {
        Row: {
          agent_slot_id: string | null
          created_at: string | null
          entities: Json | null
          id: string
          intent_category: string
          knowledge_archive_ids: string[] | null
          sentiment: string | null
          source_query: string
          sub_topic: string | null
          tools_used: string[] | null
          user_id: string
          wiki_entry_id: string | null
        }
        Insert: {
          agent_slot_id?: string | null
          created_at?: string | null
          entities?: Json | null
          id?: string
          intent_category?: string
          knowledge_archive_ids?: string[] | null
          sentiment?: string | null
          source_query: string
          sub_topic?: string | null
          tools_used?: string[] | null
          user_id: string
          wiki_entry_id?: string | null
        }
        Update: {
          agent_slot_id?: string | null
          created_at?: string | null
          entities?: Json | null
          id?: string
          intent_category?: string
          knowledge_archive_ids?: string[] | null
          sentiment?: string | null
          source_query?: string
          sub_topic?: string | null
          tools_used?: string[] | null
          user_id?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_agent_intents_agent_slot_id_fkey"
            columns: ["agent_slot_id"]
            isOneToOne: false
            referencedRelation: "ktrenz_agent_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ktrenz_agent_intents_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_agent_knowledge_archive: {
        Row: {
          citations: string[] | null
          content_raw: string | null
          content_structured: Json | null
          created_at: string
          fetched_at: string
          id: string
          query_hash: string
          query_text: string
          recency_filter: string | null
          topic_type: string
          wiki_entry_id: string | null
        }
        Insert: {
          citations?: string[] | null
          content_raw?: string | null
          content_structured?: Json | null
          created_at?: string
          fetched_at?: string
          id?: string
          query_hash: string
          query_text: string
          recency_filter?: string | null
          topic_type?: string
          wiki_entry_id?: string | null
        }
        Update: {
          citations?: string[] | null
          content_raw?: string | null
          content_structured?: Json | null
          created_at?: string
          fetched_at?: string
          id?: string
          query_hash?: string
          query_text?: string
          recency_filter?: string | null
          topic_type?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_agent_knowledge_archive_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_agent_knowledge_cache: {
        Row: {
          citations: string[] | null
          content_raw: string | null
          content_structured: Json
          created_at: string
          expires_at: string
          fetched_at: string
          hit_count: number
          id: string
          query_hash: string
          query_text: string
          recency_filter: string | null
          topic_type: string
          wiki_entry_id: string | null
        }
        Insert: {
          citations?: string[] | null
          content_raw?: string | null
          content_structured?: Json
          created_at?: string
          expires_at?: string
          fetched_at?: string
          hit_count?: number
          id?: string
          query_hash: string
          query_text: string
          recency_filter?: string | null
          topic_type?: string
          wiki_entry_id?: string | null
        }
        Update: {
          citations?: string[] | null
          content_raw?: string | null
          content_structured?: Json
          created_at?: string
          expires_at?: string
          fetched_at?: string
          hit_count?: number
          id?: string
          query_hash?: string
          query_text?: string
          recency_filter?: string | null
          topic_type?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_agent_knowledge_cache_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_agent_profiles: {
        Row: {
          agent_slot_id: string | null
          avatar_url: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_slot_id?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_slot_id?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_agent_profiles_agent_slot_id_fkey"
            columns: ["agent_slot_id"]
            isOneToOne: false
            referencedRelation: "ktrenz_agent_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_agent_slot_purchases: {
        Row: {
          created_at: string
          id: string
          point_cost: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          point_cost?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          point_cost?: number
          user_id?: string
        }
        Relationships: []
      }
      ktrenz_agent_slots: {
        Row: {
          artist_name: string | null
          avatar_url: string | null
          created_at: string
          id: string
          is_active: boolean
          slot_index: number
          updated_at: string
          user_id: string
          wiki_entry_id: string | null
        }
        Insert: {
          artist_name?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          slot_index?: number
          updated_at?: string
          user_id: string
          wiki_entry_id?: string | null
        }
        Update: {
          artist_name?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          slot_index?: number
          updated_at?: string
          user_id?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_agent_slots_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_artist_events: {
        Row: {
          created_at: string
          event_date: string
          event_title: string
          event_type: string
          id: string
          impact_window_days: number
          labeled_by: string
          metadata: Json | null
          source_url: string | null
          updated_at: string
          verified: boolean
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          event_date: string
          event_title: string
          event_type: string
          id?: string
          impact_window_days?: number
          labeled_by?: string
          metadata?: Json | null
          source_url?: string | null
          updated_at?: string
          verified?: boolean
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          event_date?: string
          event_title?: string
          event_type?: string
          id?: string
          impact_window_days?: number
          labeled_by?: string
          metadata?: Json | null
          source_url?: string | null
          updated_at?: string
          verified?: boolean
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_artist_events_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_attention_signals: {
        Row: {
          avg_dwell_sections: number | null
          created_at: string
          detail_sections: Json
          detail_views: number
          external_link_clicks: number
          id: string
          ranking_card_clicks: number
          signal_date: string
          treemap_clicks: number
          unique_viewers: number
          wiki_entry_id: string
        }
        Insert: {
          avg_dwell_sections?: number | null
          created_at?: string
          detail_sections?: Json
          detail_views?: number
          external_link_clicks?: number
          id?: string
          ranking_card_clicks?: number
          signal_date: string
          treemap_clicks?: number
          unique_viewers?: number
          wiki_entry_id: string
        }
        Update: {
          avg_dwell_sections?: number | null
          created_at?: string
          detail_sections?: Json
          detail_views?: number
          external_link_clicks?: number
          id?: string
          ranking_card_clicks?: number
          signal_date?: string
          treemap_clicks?: number
          unique_viewers?: number
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_attention_signals_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_category_trends: {
        Row: {
          avg_30d: number | null
          avg_7d: number | null
          calculated_at: string
          category: string
          change_30d: number | null
          change_7d: number | null
          id: string
          momentum: number | null
          stddev_30d: number | null
          stddev_7d: number | null
          trend_direction: string | null
          wiki_entry_id: string
        }
        Insert: {
          avg_30d?: number | null
          avg_7d?: number | null
          calculated_at?: string
          category: string
          change_30d?: number | null
          change_7d?: number | null
          id?: string
          momentum?: number | null
          stddev_30d?: number | null
          stddev_7d?: number | null
          trend_direction?: string | null
          wiki_entry_id: string
        }
        Update: {
          avg_30d?: number | null
          avg_7d?: number | null
          calculated_at?: string
          category?: string
          change_30d?: number | null
          change_7d?: number | null
          id?: string
          momentum?: number | null
          stddev_30d?: number | null
          stddev_7d?: number | null
          trend_direction?: string | null
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_collection_config: {
        Row: {
          hanteo_chart_url: string
          hanteo_daily_url: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          hanteo_chart_url?: string
          hanteo_daily_url?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          hanteo_chart_url?: string
          hanteo_daily_url?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ktrenz_collection_log: {
        Row: {
          collected_at: string
          error_message: string | null
          id: string
          platform: string
          records_collected: number | null
          status: string
          wiki_entry_id: string | null
        }
        Insert: {
          collected_at?: string
          error_message?: string | null
          id?: string
          platform: string
          records_collected?: number | null
          status?: string
          wiki_entry_id?: string | null
        }
        Update: {
          collected_at?: string
          error_message?: string | null
          id?: string
          platform?: string
          records_collected?: number | null
          status?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_collection_log_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_daily_missions: {
        Row: {
          completed_at: string
          content_id: string | null
          id: string
          mission_date: string
          mission_key: string
          points_awarded: number
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          completed_at?: string
          content_id?: string | null
          id?: string
          mission_date?: string
          mission_key: string
          points_awarded?: number
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          completed_at?: string
          content_id?: string | null
          id?: string
          mission_date?: string
          mission_key?: string
          points_awarded?: number
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_data_quality_issues: {
        Row: {
          actual_value: string | null
          artist_name: string | null
          description: string | null
          detected_at: string
          expected_value: string | null
          id: string
          issue_type: string
          platform: string | null
          resolution_note: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          suppressed: boolean
          suppressed_at: string | null
          suppressed_note: string | null
          title: string
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          actual_value?: string | null
          artist_name?: string | null
          description?: string | null
          detected_at?: string
          expected_value?: string | null
          id?: string
          issue_type: string
          platform?: string | null
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          suppressed?: boolean
          suppressed_at?: string | null
          suppressed_note?: string | null
          title: string
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          actual_value?: string | null
          artist_name?: string | null
          description?: string | null
          detected_at?: string
          expected_value?: string | null
          id?: string
          issue_type?: string
          platform?: string | null
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          suppressed?: boolean
          suppressed_at?: string | null
          suppressed_note?: string | null
          title?: string
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_data_run_usage: {
        Row: {
          created_at: string
          id: string
          module: string
          run_date: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module: string
          run_date?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: string
          run_date?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_data_snapshots: {
        Row: {
          collected_at: string
          guard_flagged: boolean
          guard_log_id: string | null
          id: string
          metrics: Json
          platform: string
          raw_response: Json | null
          wiki_entry_id: string | null
        }
        Insert: {
          collected_at?: string
          guard_flagged?: boolean
          guard_log_id?: string | null
          id?: string
          metrics?: Json
          platform: string
          raw_response?: Json | null
          wiki_entry_id?: string | null
        }
        Update: {
          collected_at?: string
          guard_flagged?: boolean
          guard_log_id?: string | null
          id?: string
          metrics?: Json
          platform?: string
          raw_response?: Json | null
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_data_snapshots_guard_log_id_fkey"
            columns: ["guard_log_id"]
            isOneToOne: false
            referencedRelation: "ktrenz_guard_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ktrenz_data_snapshots_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_engine_runs: {
        Row: {
          completed_at: string | null
          current_module: string | null
          error_message: string | null
          id: string
          modules_requested: string[] | null
          results: Json | null
          started_at: string | null
          status: string
          trigger_source: string | null
        }
        Insert: {
          completed_at?: string | null
          current_module?: string | null
          error_message?: string | null
          id?: string
          modules_requested?: string[] | null
          results?: Json | null
          started_at?: string | null
          status?: string
          trigger_source?: string | null
        }
        Update: {
          completed_at?: string | null
          current_module?: string | null
          error_message?: string | null
          id?: string
          modules_requested?: string[] | null
          results?: Json | null
          started_at?: string | null
          status?: string
          trigger_source?: string | null
        }
        Relationships: []
      }
      ktrenz_external_video_matches: {
        Row: {
          category: string | null
          channel_id: string
          collected_at: string
          comment_count: number | null
          id: string
          like_count: number | null
          matched_name: string | null
          published_at: string | null
          video_id: string
          video_title: string
          view_count: number | null
          wiki_entry_id: string
        }
        Insert: {
          category?: string | null
          channel_id: string
          collected_at?: string
          comment_count?: number | null
          id?: string
          like_count?: number | null
          matched_name?: string | null
          published_at?: string | null
          video_id: string
          video_title: string
          view_count?: number | null
          wiki_entry_id: string
        }
        Update: {
          category?: string | null
          channel_id?: string
          collected_at?: string
          comment_count?: number | null
          id?: string
          like_count?: number | null
          matched_name?: string | null
          published_at?: string | null
          video_id?: string
          video_title?: string
          view_count?: number | null
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_external_video_matches_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_fan_agent_messages: {
        Row: {
          agent_slot_id: string | null
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          mode: string | null
          role: string
          user_id: string
        }
        Insert: {
          agent_slot_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          mode?: string | null
          role: string
          user_id: string
        }
        Update: {
          agent_slot_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          mode?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_fan_agent_messages_agent_slot_id_fkey"
            columns: ["agent_slot_id"]
            isOneToOne: false
            referencedRelation: "ktrenz_agent_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_fan_contributions: {
        Row: {
          click_count: number
          id: string
          platform: string
          updated_at: string
          user_id: string
          weighted_score: number
          wiki_entry_id: string
        }
        Insert: {
          click_count?: number
          id?: string
          platform: string
          updated_at?: string
          user_id: string
          weighted_score?: number
          wiki_entry_id: string
        }
        Update: {
          click_count?: number
          id?: string
          platform?: string
          updated_at?: string
          user_id?: string
          weighted_score?: number
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_fan_contributions_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_fandom_signals: {
        Row: {
          avg_session_depth: number | null
          created_at: string
          hot_topics: Json
          id: string
          intent_distribution: Json
          sentiment_avg: number | null
          sentiment_distribution: Json
          signal_date: string
          total_queries: number
          unique_users: number
          wiki_entry_id: string
        }
        Insert: {
          avg_session_depth?: number | null
          created_at?: string
          hot_topics?: Json
          id?: string
          intent_distribution?: Json
          sentiment_avg?: number | null
          sentiment_distribution?: Json
          signal_date: string
          total_queries?: number
          unique_users?: number
          wiki_entry_id: string
        }
        Update: {
          avg_session_depth?: number | null
          created_at?: string
          hot_topics?: Json
          id?: string
          intent_distribution?: Json
          sentiment_avg?: number | null
          sentiment_distribution?: Json
          signal_date?: string
          total_queries?: number
          unique_users?: number
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_fandom_signals_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_fes_contributions: {
        Row: {
          album_contrib: number | null
          album_z: number | null
          buzz_contrib: number | null
          buzz_z: number | null
          created_at: string
          id: string
          leading_category: string | null
          music_contrib: number | null
          music_z: number | null
          normalized_fes: number | null
          snapshot_at: string
          social_contrib: number | null
          social_z: number | null
          wiki_entry_id: string
          youtube_contrib: number | null
          youtube_z: number | null
        }
        Insert: {
          album_contrib?: number | null
          album_z?: number | null
          buzz_contrib?: number | null
          buzz_z?: number | null
          created_at?: string
          id?: string
          leading_category?: string | null
          music_contrib?: number | null
          music_z?: number | null
          normalized_fes?: number | null
          snapshot_at?: string
          social_contrib?: number | null
          social_z?: number | null
          wiki_entry_id: string
          youtube_contrib?: number | null
          youtube_z?: number | null
        }
        Update: {
          album_contrib?: number | null
          album_z?: number | null
          buzz_contrib?: number | null
          buzz_z?: number | null
          created_at?: string
          id?: string
          leading_category?: string | null
          music_contrib?: number | null
          music_z?: number | null
          normalized_fes?: number | null
          snapshot_at?: string
          social_contrib?: number | null
          social_z?: number | null
          wiki_entry_id?: string
          youtube_contrib?: number | null
          youtube_z?: number | null
        }
        Relationships: []
      }
      ktrenz_geo_change_signals: {
        Row: {
          change_rate: number | null
          country_code: string
          country_name: string
          current_rank: number | null
          current_value: number
          detected_at: string
          id: string
          is_spike: boolean
          previous_rank: number | null
          previous_value: number | null
          rank_change: number | null
          source: string
          spike_direction: string | null
          wiki_entry_id: string
          window_hours: number
        }
        Insert: {
          change_rate?: number | null
          country_code: string
          country_name: string
          current_rank?: number | null
          current_value?: number
          detected_at?: string
          id?: string
          is_spike?: boolean
          previous_rank?: number | null
          previous_value?: number | null
          rank_change?: number | null
          source: string
          spike_direction?: string | null
          wiki_entry_id: string
          window_hours?: number
        }
        Update: {
          change_rate?: number | null
          country_code?: string
          country_name?: string
          current_rank?: number | null
          current_value?: number
          detected_at?: string
          id?: string
          is_spike?: boolean
          previous_rank?: number | null
          previous_value?: number | null
          rank_change?: number | null
          source?: string
          spike_direction?: string | null
          wiki_entry_id?: string
          window_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_geo_change_signals_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_geo_fan_data: {
        Row: {
          collected_at: string
          country_code: string
          country_name: string
          id: string
          interest_score: number | null
          listeners: number | null
          rank_position: number | null
          source: string
          wiki_entry_id: string
        }
        Insert: {
          collected_at?: string
          country_code: string
          country_name: string
          id?: string
          interest_score?: number | null
          listeners?: number | null
          rank_position?: number | null
          source?: string
          wiki_entry_id: string
        }
        Update: {
          collected_at?: string
          country_code?: string
          country_name?: string
          id?: string
          interest_score?: number | null
          listeners?: number | null
          rank_position?: number | null
          source?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_geo_fan_data_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_guard_logs: {
        Row: {
          action: string
          created_at: string
          current_value: Json
          delta_pct: number | null
          engine_run_id: string | null
          guard_rule: string
          id: string
          module: string
          previous_value: Json | null
          resolved: boolean
          snapshot_id: string | null
          wiki_entry_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          current_value?: Json
          delta_pct?: number | null
          engine_run_id?: string | null
          guard_rule: string
          id?: string
          module: string
          previous_value?: Json | null
          resolved?: boolean
          snapshot_id?: string | null
          wiki_entry_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          current_value?: Json
          delta_pct?: number | null
          engine_run_id?: string | null
          guard_rule?: string
          id?: string
          module?: string
          previous_value?: Json | null
          resolved?: boolean
          snapshot_id?: string | null
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_guard_logs_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_milestone_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          notified: boolean
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          notified?: boolean
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          notified?: boolean
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_normalization_stats: {
        Row: {
          calculated_at: string
          category: string
          id: string
          mean_change: number | null
          median_change: number | null
          sample_count: number | null
          stddev_change: number | null
        }
        Insert: {
          calculated_at?: string
          category: string
          id?: string
          mean_change?: number | null
          median_change?: number | null
          sample_count?: number | null
          stddev_change?: number | null
        }
        Update: {
          calculated_at?: string
          category?: string
          id?: string
          mean_change?: number | null
          median_change?: number | null
          sample_count?: number | null
          stddev_change?: number | null
        }
        Relationships: []
      }
      ktrenz_point_packages: {
        Row: {
          bonus_label: string | null
          created_at: string
          currency: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          package_key: string
          points: number
          price_cents: number
          stripe_price_id: string
          updated_at: string
        }
        Insert: {
          bonus_label?: string | null
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          package_key: string
          points: number
          price_cents: number
          stripe_price_id: string
          updated_at?: string
        }
        Update: {
          bonus_label?: string | null
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          package_key?: string
          points?: number
          price_cents?: number
          stripe_price_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ktrenz_point_purchases: {
        Row: {
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          package_key: string
          points_amount: number
          price_cents: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          package_key: string
          points_amount: number
          price_cents: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          package_key?: string
          points_amount?: number
          price_cents?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ktrenz_point_settings: {
        Row: {
          description: string | null
          id: string
          is_enabled: boolean
          points: number
          reward_name: string
          reward_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          is_enabled?: boolean
          points?: number
          reward_name: string
          reward_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          is_enabled?: boolean
          points?: number
          reward_name?: string
          reward_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ktrenz_point_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      ktrenz_prediction_logs: {
        Row: {
          accuracy_score: number | null
          created_at: string
          features_used: Json | null
          id: string
          model_version: string | null
          outcome: Json | null
          predicted_at: string
          prediction: Json
          prediction_type: string
          reasoning: string | null
          verified_at: string | null
          wiki_entry_id: string
        }
        Insert: {
          accuracy_score?: number | null
          created_at?: string
          features_used?: Json | null
          id?: string
          model_version?: string | null
          outcome?: Json | null
          predicted_at?: string
          prediction?: Json
          prediction_type: string
          reasoning?: string | null
          verified_at?: string | null
          wiki_entry_id: string
        }
        Update: {
          accuracy_score?: number | null
          created_at?: string
          features_used?: Json | null
          id?: string
          model_version?: string | null
          outcome?: Json | null
          predicted_at?: string
          prediction?: Json
          prediction_type?: string
          reasoning?: string | null
          verified_at?: string | null
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_schedules: {
        Row: {
          artist_name: string
          category: string | null
          created_at: string | null
          event_date: string
          event_time: string | null
          id: string
          source: string | null
          source_url: string | null
          title: string
          updated_at: string | null
          wiki_entry_id: string | null
        }
        Insert: {
          artist_name: string
          category?: string | null
          created_at?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          source?: string | null
          source_url?: string | null
          title: string
          updated_at?: string | null
          wiki_entry_id?: string | null
        }
        Update: {
          artist_name?: string
          category?: string | null
          created_at?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          source?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string | null
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_schedules_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_stars: {
        Row: {
          created_at: string | null
          display_name: string
          group_star_id: string | null
          id: string
          influence_categories: string[] | null
          is_active: boolean | null
          musicbrainz_id: string | null
          name_ko: string | null
          social_handles: Json | null
          star_type: string
          updated_at: string | null
          wiki_entry_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          group_star_id?: string | null
          id?: string
          influence_categories?: string[] | null
          is_active?: boolean | null
          musicbrainz_id?: string | null
          name_ko?: string | null
          social_handles?: Json | null
          star_type: string
          updated_at?: string | null
          wiki_entry_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          group_star_id?: string | null
          id?: string
          influence_categories?: string[] | null
          is_active?: boolean | null
          musicbrainz_id?: string | null
          name_ko?: string | null
          social_handles?: Json | null
          star_type?: string
          updated_at?: string | null
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_stars_group_star_id_fkey"
            columns: ["group_star_id"]
            isOneToOne: false
            referencedRelation: "ktrenz_stars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ktrenz_stars_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_streaming_guides: {
        Row: {
          artist_name: string
          expires_at: string
          generated_at: string
          guide_data: Json
          id: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          artist_name: string
          expires_at?: string
          generated_at?: string
          guide_data?: Json
          id?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          artist_name?: string
          expires_at?: string
          generated_at?: string
          guide_data?: Json
          id?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_streaming_guides_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_trend_tracking: {
        Row: {
          created_at: string
          delta_pct: number | null
          id: string
          interest_score: number | null
          keyword: string
          raw_response: Json | null
          region: string | null
          search_volume: number | null
          tracked_at: string
          trigger_id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          delta_pct?: number | null
          id?: string
          interest_score?: number | null
          keyword: string
          raw_response?: Json | null
          region?: string | null
          search_volume?: number | null
          tracked_at?: string
          trigger_id: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          delta_pct?: number | null
          id?: string
          interest_score?: number | null
          keyword?: string
          raw_response?: Json | null
          region?: string | null
          search_volume?: number | null
          tracked_at?: string
          trigger_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_trend_tracking_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "ktrenz_trend_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_trend_triggers: {
        Row: {
          artist_name: string
          baseline_score: number | null
          confidence: number | null
          context: string | null
          created_at: string
          detected_at: string
          id: string
          influence_index: number | null
          keyword: string
          keyword_category: string
          keyword_ja: string | null
          keyword_ko: string | null
          keyword_zh: string | null
          metadata: Json | null
          peak_at: string | null
          peak_score: number | null
          source_title: string | null
          source_url: string | null
          star_id: string | null
          status: string
          trigger_source: string
          trigger_type: string
          wiki_entry_id: string
        }
        Insert: {
          artist_name: string
          baseline_score?: number | null
          confidence?: number | null
          context?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          influence_index?: number | null
          keyword: string
          keyword_category?: string
          keyword_ja?: string | null
          keyword_ko?: string | null
          keyword_zh?: string | null
          metadata?: Json | null
          peak_at?: string | null
          peak_score?: number | null
          source_title?: string | null
          source_url?: string | null
          star_id?: string | null
          status?: string
          trigger_source?: string
          trigger_type?: string
          wiki_entry_id: string
        }
        Update: {
          artist_name?: string
          baseline_score?: number | null
          confidence?: number | null
          context?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          influence_index?: number | null
          keyword?: string
          keyword_category?: string
          keyword_ja?: string | null
          keyword_ko?: string | null
          keyword_zh?: string | null
          metadata?: Json | null
          peak_at?: string | null
          peak_score?: number | null
          source_title?: string | null
          source_url?: string | null
          star_id?: string | null
          status?: string
          trigger_source?: string
          trigger_type?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_trend_triggers_star_id_fkey"
            columns: ["star_id"]
            isOneToOne: false
            referencedRelation: "ktrenz_stars"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_user_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ktrenz_user_logins: {
        Row: {
          first_login_at: string
          id: string
          last_login_at: string
          login_count: number
          user_id: string
        }
        Insert: {
          first_login_at?: string
          id?: string
          last_login_at?: string
          login_count?: number
          user_id: string
        }
        Update: {
          first_login_at?: string
          id?: string
          last_login_at?: string
          login_count?: number
          user_id?: string
        }
        Relationships: []
      }
      ktrenz_user_points: {
        Row: {
          created_at: string
          id: string
          lifetime_points: number
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lifetime_points?: number
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lifetime_points?: number
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ktrenz_velocity_profile_summary: {
        Row: {
          avg_peak_day_offset: number | null
          avg_peak_velocity: number | null
          avg_post_velocity: number | null
          avg_pre_velocity: number | null
          avg_recovery_days: number | null
          category: string
          event_count: number | null
          event_type: string
          id: string
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          avg_peak_day_offset?: number | null
          avg_peak_velocity?: number | null
          avg_post_velocity?: number | null
          avg_pre_velocity?: number | null
          avg_recovery_days?: number | null
          category: string
          event_count?: number | null
          event_type: string
          id?: string
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          avg_peak_day_offset?: number | null
          avg_peak_velocity?: number | null
          avg_post_velocity?: number | null
          avg_pre_velocity?: number | null
          avg_recovery_days?: number | null
          category?: string
          event_count?: number | null
          event_type?: string
          id?: string
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_velocity_stats: {
        Row: {
          avg_intensity: number | null
          avg_velocity: number | null
          calculated_at: string
          category: string
          drop_count: number | null
          id: string
          max_velocity: number | null
          min_velocity: number | null
          peak_day: string | null
          sample_count: number | null
          spike_count: number | null
          stddev_velocity: number | null
          time_window: string
          trough_day: string | null
          velocity_trend: string | null
          wiki_entry_id: string
        }
        Insert: {
          avg_intensity?: number | null
          avg_velocity?: number | null
          calculated_at?: string
          category: string
          drop_count?: number | null
          id?: string
          max_velocity?: number | null
          min_velocity?: number | null
          peak_day?: string | null
          sample_count?: number | null
          spike_count?: number | null
          stddev_velocity?: number | null
          time_window: string
          trough_day?: string | null
          velocity_trend?: string | null
          wiki_entry_id: string
        }
        Update: {
          avg_intensity?: number | null
          avg_velocity?: number | null
          calculated_at?: string
          category?: string
          drop_count?: number | null
          id?: string
          max_velocity?: number | null
          min_velocity?: number | null
          peak_day?: string | null
          sample_count?: number | null
          spike_count?: number | null
          stddev_velocity?: number | null
          time_window?: string
          trough_day?: string | null
          velocity_trend?: string | null
          wiki_entry_id?: string
        }
        Relationships: []
      }
      ktrenz_watched_artists: {
        Row: {
          artist_name: string
          created_at: string
          id: string
          user_id: string
          wiki_entry_id: string | null
        }
        Insert: {
          artist_name: string
          created_at?: string
          id?: string
          user_id: string
          wiki_entry_id?: string | null
        }
        Update: {
          artist_name?: string
          created_at?: string
          id?: string
          user_id?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ktrenz_watched_artists_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ktrenz_watched_channels: {
        Row: {
          category: string | null
          channel_id: string
          channel_name: string
          channel_url: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          category?: string | null
          channel_id: string
          channel_name: string
          channel_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          category?: string | null
          channel_id?: string
          channel_name?: string
          channel_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      levels: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: number
          max_daily_votes: number
          name: string
          required_points: number
          token_reward: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id: number
          max_daily_votes?: number
          name: string
          required_points: number
          token_reward?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: number
          max_daily_votes?: number
          name?: string
          required_points?: number
          token_reward?: number | null
        }
        Relationships: []
      }
      lightstick_balances: {
        Row: {
          balance: number
          created_at: string
          id: string
          total_purchased: number
          total_thrown: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          total_purchased?: number
          total_thrown?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          total_purchased?: number
          total_thrown?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lightstick_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lightstick_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lightstick_transactions: {
        Row: {
          amount: number
          created_at: string
          dau_recorded_at: string | null
          id: string
          onchain_batch_hash: string | null
          onchain_tx_hash: string | null
          payment_method: string | null
          stripe_session_id: string | null
          total_usdc: number
          type: string
          unit_price_usdc: number
          user_id: string
          wiki_entry_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          dau_recorded_at?: string | null
          id?: string
          onchain_batch_hash?: string | null
          onchain_tx_hash?: string | null
          payment_method?: string | null
          stripe_session_id?: string | null
          total_usdc: number
          type: string
          unit_price_usdc?: number
          user_id: string
          wiki_entry_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          dau_recorded_at?: string | null
          id?: string
          onchain_batch_hash?: string | null
          onchain_tx_hash?: string | null
          payment_method?: string | null
          stripe_session_id?: string | null
          total_usdc?: number
          type?: string
          unit_price_usdc?: number
          user_id?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lightstick_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lightstick_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lightstick_transactions_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      lol_badges: {
        Row: {
          color: string
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          requirement_category: string | null
          requirement_type: string
          requirement_value: number
        }
        Insert: {
          color?: string
          created_at?: string
          description: string
          icon: string
          id?: string
          name: string
          requirement_category?: string | null
          requirement_type: string
          requirement_value?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          requirement_category?: string | null
          requirement_type?: string
          requirement_value?: number
        }
        Relationships: []
      }
      lol_chat_messages: {
        Row: {
          content: string
          created_at: string
          feedback: string | null
          id: string
          message_type: string | null
          role: string
          session_id: string
          token_cost: number | null
        }
        Insert: {
          content: string
          created_at?: string
          feedback?: string | null
          id?: string
          message_type?: string | null
          role: string
          session_id: string
          token_cost?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          feedback?: string | null
          id?: string
          message_type?: string | null
          role?: string
          session_id?: string
          token_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lol_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lol_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lol_chat_sessions: {
        Row: {
          created_at: string
          id: string
          sample_user_key: string
          session_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          sample_user_key: string
          session_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          sample_user_key?: string
          session_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lol_missions: {
        Row: {
          category: string
          created_at: string
          description: string
          difficulty: string
          icon: string | null
          id: string
          is_active: boolean
          tier_requirement: string | null
          title: string
          xp_reward: number
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          difficulty?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          tier_requirement?: string | null
          title: string
          xp_reward?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          difficulty?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          tier_requirement?: string | null
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
      lol_user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lol_user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "lol_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      lol_user_missions: {
        Row: {
          completed_at: string | null
          id: string
          mission_id: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          mission_id: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          mission_id?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lol_user_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "lol_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      lol_user_progress: {
        Row: {
          combat_score: number
          created_at: string
          current_level: number
          current_xp: number
          id: string
          laning_score: number
          missions_completed: number
          resource_score: number
          updated_at: string
          user_id: string
          vision_score: number
        }
        Insert: {
          combat_score?: number
          created_at?: string
          current_level?: number
          current_xp?: number
          id?: string
          laning_score?: number
          missions_completed?: number
          resource_score?: number
          updated_at?: string
          user_id: string
          vision_score?: number
        }
        Update: {
          combat_score?: number
          created_at?: string
          current_level?: number
          current_xp?: number
          id?: string
          laning_score?: number
          missions_completed?: number
          resource_score?: number
          updated_at?: string
          user_id?: string
          vision_score?: number
        }
        Relationships: []
      }
      market_groups: {
        Row: {
          close_time: string
          correct_option_label: string | null
          created_at: string
          creator_id: string
          description: string | null
          id: string
          question: string
          status: string
          updated_at: string
        }
        Insert: {
          close_time: string
          correct_option_label?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          question: string
          status?: string
          updated_at?: string
        }
        Update: {
          close_time?: string
          correct_option_label?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          question?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_pools: {
        Row: {
          close_time: string
          collateral_locked: number
          correct_outcome: string | null
          created_at: string | null
          creator_id: string
          description: string | null
          fee_rate: number
          group_id: string | null
          id: string
          image_url: string | null
          no_shares: number
          option_label: string | null
          question: string
          seed_usdc: number
          settled_at: string | null
          settled_by: string | null
          status: string
          total_fees_usdc: number
          total_volume_usdc: number
          updated_at: string | null
          version: number
          wiki_entry_id: string | null
          yes_shares: number
        }
        Insert: {
          close_time: string
          collateral_locked?: number
          correct_outcome?: string | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          fee_rate?: number
          group_id?: string | null
          id?: string
          image_url?: string | null
          no_shares?: number
          option_label?: string | null
          question: string
          seed_usdc?: number
          settled_at?: string | null
          settled_by?: string | null
          status?: string
          total_fees_usdc?: number
          total_volume_usdc?: number
          updated_at?: string | null
          version?: number
          wiki_entry_id?: string | null
          yes_shares?: number
        }
        Update: {
          close_time?: string
          collateral_locked?: number
          correct_outcome?: string | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          fee_rate?: number
          group_id?: string | null
          id?: string
          image_url?: string | null
          no_shares?: number
          option_label?: string | null
          question?: string
          seed_usdc?: number
          settled_at?: string | null
          settled_by?: string | null
          status?: string
          total_fees_usdc?: number
          total_volume_usdc?: number
          updated_at?: string | null
          version?: number
          wiki_entry_id?: string | null
          yes_shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_pools_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "market_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_pools_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      master_applications: {
        Row: {
          artist_name: string
          created_at: string
          email: string
          id: string
          message: string | null
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          artist_name: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          artist_name?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          mentioned_user_id: string
          mentioner_user_id: string
          post_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          mentioned_user_id: string
          mentioner_user_id: string
          post_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          mentioned_user_id?: string
          mentioner_user_id?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onchain_nonces: {
        Row: {
          created_at: string
          current_nonce: number
          id: string
          last_used_at: string
          sender_address: string
        }
        Insert: {
          created_at?: string
          current_nonce?: number
          id?: string
          last_used_at?: string
          sender_address: string
        }
        Update: {
          created_at?: string
          current_nonce?: number
          id?: string
          last_used_at?: string
          sender_address?: string
        }
        Relationships: []
      }
      onchain_scan_state: {
        Row: {
          contract_address: string
          id: string
          last_scanned_block: number
          updated_at: string
        }
        Insert: {
          contract_address: string
          id?: string
          last_scanned_block?: number
          updated_at?: string
        }
        Update: {
          contract_address?: string
          id?: string
          last_scanned_block?: number
          updated_at?: string
        }
        Relationships: []
      }
      onchain_tx_cache: {
        Row: {
          block_number: number
          block_timestamp: string
          contract_address: string
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          log_index: number
          tx_hash: string
        }
        Insert: {
          block_number: number
          block_timestamp: string
          contract_address: string
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          log_index: number
          tx_hash: string
        }
        Update: {
          block_number?: number
          block_timestamp?: string
          contract_address?: string
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          log_index?: number
          tx_hash?: string
        }
        Relationships: []
      }
      onchain_vote_cache: {
        Row: {
          created_at: string
          event_id: string
          id: string
          last_synced_at: string
          total_votes: number
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          last_synced_at?: string
          total_votes?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          last_synced_at?: string
          total_votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "onchain_vote_cache_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "special_vote_events"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_applications: {
        Row: {
          created_at: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          twitter_handle: string
          updated_at: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          twitter_handle: string
          updated_at?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          twitter_handle?: string
          updated_at?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_applications_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      pioneer_claims: {
        Row: {
          claimed_at: string
          created_at: string
          fid: number
          id: string
          user_id: string | null
          wallet_address: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          fid: number
          id?: string
          user_id?: string | null
          wallet_address: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          fid?: number
          id?: string
          user_id?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      point_products: {
        Row: {
          badge_text: string | null
          billing_interval: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          points: number
          price_usd: number
          product_type: string
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          billing_interval?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          points: number
          price_usd: number
          product_type?: string
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          billing_interval?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          points?: number
          price_usd?: number
          product_type?: string
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      point_purchases: {
        Row: {
          amount_paid: number
          created_at: string
          currency: string
          id: string
          points_received: number
          product_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_paid: number
          created_at?: string
          currency?: string
          id?: string
          points_received: number
          product_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          currency?: string
          id?: string
          points_received?: number
          product_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "point_products"
            referencedColumns: ["id"]
          },
        ]
      }
      point_rules: {
        Row: {
          action_type: string
          category: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          points: number
          updated_at: string
        }
        Insert: {
          action_type: string
          category: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          points: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      point_transactions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          points: number
          reference_id: string | null
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          points: number
          reference_id?: string | null
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          points?: number
          reference_id?: string | null
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      post_rankings: {
        Row: {
          created_at: string
          id: string
          post_id: string
          rank: number
          snapshot_at: string
          sort_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          rank: number
          snapshot_at?: string
          sort_type: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          rank?: number
          snapshot_at?: string
          sort_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_rankings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          id: string
          post_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "wiki_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      post_votes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          tx_hash: string | null
          updated_at: string
          user_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          vote_type?: Database["public"]["Enums"]["vote_type"]
        }
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          boosted_at: string | null
          boosted_until: string | null
          category: string | null
          community_id: string | null
          content: string
          created_at: string
          event_date: string | null
          id: string
          image_url: string | null
          is_approved: boolean | null
          is_auto_generated: boolean | null
          is_boosted: boolean | null
          is_pinned: boolean | null
          metadata: Json | null
          pinned_at: string | null
          pinned_by: string | null
          slug: string | null
          source_url: string | null
          title: string
          trending_score: number
          updated_at: string
          user_id: string
          view_count: number
          visibility: string
          votes: number
          wiki_entry_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          boosted_at?: string | null
          boosted_until?: string | null
          category?: string | null
          community_id?: string | null
          content: string
          created_at?: string
          event_date?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          is_auto_generated?: boolean | null
          is_boosted?: boolean | null
          is_pinned?: boolean | null
          metadata?: Json | null
          pinned_at?: string | null
          pinned_by?: string | null
          slug?: string | null
          source_url?: string | null
          title: string
          trending_score?: number
          updated_at?: string
          user_id: string
          view_count?: number
          visibility?: string
          votes?: number
          wiki_entry_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          boosted_at?: string | null
          boosted_until?: string | null
          category?: string | null
          community_id?: string | null
          content?: string
          created_at?: string
          event_date?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          is_auto_generated?: boolean | null
          is_boosted?: boolean | null
          is_pinned?: boolean | null
          metadata?: Json | null
          pinned_at?: string | null
          pinned_by?: string | null
          slug?: string | null
          source_url?: string | null
          title?: string
          trending_score?: number
          updated_at?: string
          user_id?: string
          view_count?: number
          visibility?: string
          votes?: number
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          available_points: number
          avatar_url: string | null
          bio: string | null
          created_at: string
          current_level: number
          display_name: string | null
          id: string
          invitation_verified: boolean
          is_verified: boolean
          is_vip: boolean
          lol_tts_enabled: boolean | null
          stripe_account_id: string | null
          tebex_wallet_ref: string | null
          total_points: number
          updated_at: string
          username: string
          verification_type: string | null
        }
        Insert: {
          available_points?: number
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_level?: number
          display_name?: string | null
          id: string
          invitation_verified?: boolean
          is_verified?: boolean
          is_vip?: boolean
          lol_tts_enabled?: boolean | null
          stripe_account_id?: string | null
          tebex_wallet_ref?: string | null
          total_points?: number
          updated_at?: string
          username: string
          verification_type?: string | null
        }
        Update: {
          available_points?: number
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_level?: number
          display_name?: string | null
          id?: string
          invitation_verified?: boolean
          is_verified?: boolean
          is_vip?: boolean
          lol_tts_enabled?: boolean | null
          stripe_account_id?: string | null
          tebex_wallet_ref?: string | null
          total_points?: number
          updated_at?: string
          username?: string
          verification_type?: string | null
        }
        Relationships: []
      }
      proposal_chat_messages: {
        Row: {
          created_at: string
          id: string
          original_language: string | null
          original_message: string
          proposal_id: string
          translated_message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_language?: string | null
          original_message: string
          proposal_id: string
          translated_message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          original_language?: string | null
          original_message?: string
          proposal_id?: string
          translated_message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_chat_messages_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "support_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_completions: {
        Row: {
          completed_at: string
          id: string
          points_awarded: number
          quest_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          points_awarded?: number
          quest_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          points_awarded?: number
          quest_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          conditions: Json
          created_at: string
          description: string
          end_date: string | null
          id: string
          is_active: boolean
          points_reward: number
          quest_type: string
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          description: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          points_reward?: number
          quest_type: string
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          points_reward?: number
          quest_type?: string
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      schema_type_relationships: {
        Row: {
          child_schema_type: string
          created_at: string | null
          created_by: string | null
          id: string
          parent_schema_type: string
        }
        Insert: {
          child_schema_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          parent_schema_type: string
        }
        Update: {
          child_schema_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          parent_schema_type?: string
        }
        Relationships: []
      }
      special_vote_events: {
        Row: {
          created_at: string
          created_by: string
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          title: string
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_time: string
          id?: string
          is_active?: boolean
          start_time?: string
          title: string
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          title?: string
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_vote_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_vote_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_vote_events_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      special_votes: {
        Row: {
          created_at: string
          event_id: string
          fingerprint: string | null
          id: string
          ip_hash: string | null
          tx_hash: string | null
          user_id: string | null
          vote_count: number
        }
        Insert: {
          created_at?: string
          event_id: string
          fingerprint?: string | null
          id?: string
          ip_hash?: string | null
          tx_hash?: string | null
          user_id?: string | null
          vote_count?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          fingerprint?: string | null
          id?: string
          ip_hash?: string | null
          tx_hash?: string | null
          user_id?: string | null
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "special_votes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "special_vote_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          created_at: string | null
          event_id: string
          event_type: string
          id: string
          metadata: Json | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          event_type: string
          id?: string
          metadata?: Json | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          processed_at?: string | null
        }
        Relationships: []
      }
      support_proposal_opinion_votes: {
        Row: {
          created_at: string
          id: string
          lightstick_count: number
          opinion_id: string
          tx_hash: string | null
          updated_at: string
          user_id: string
          vote_type: string
          vote_weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          lightstick_count?: number
          opinion_id: string
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          vote_type: string
          vote_weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          lightstick_count?: number
          opinion_id?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          vote_type?: string
          vote_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_proposal_opinion_votes_opinion_id_fkey"
            columns: ["opinion_id"]
            isOneToOne: false
            referencedRelation: "support_proposal_opinions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposal_opinion_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposal_opinion_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      support_proposal_opinions: {
        Row: {
          created_at: string
          id: string
          lightstick_count: number
          opinion: string
          proposal_id: string
          total_vote_weight: number
          tx_hash: string | null
          user_id: string
          votes_against: number
          votes_for: number
        }
        Insert: {
          created_at?: string
          id?: string
          lightstick_count?: number
          opinion: string
          proposal_id: string
          total_vote_weight?: number
          tx_hash?: string | null
          user_id: string
          votes_against?: number
          votes_for?: number
        }
        Update: {
          created_at?: string
          id?: string
          lightstick_count?: number
          opinion?: string
          proposal_id?: string
          total_vote_weight?: number
          tx_hash?: string | null
          user_id?: string
          votes_against?: number
          votes_for?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_proposal_opinions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "support_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposal_opinions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposal_opinions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      support_proposal_votes: {
        Row: {
          created_at: string
          id: string
          lightstick_count: number
          proposal_id: string
          tx_hash: string | null
          user_id: string
          vote_type: string
          vote_weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          lightstick_count?: number
          proposal_id: string
          tx_hash?: string | null
          user_id: string
          vote_type: string
          vote_weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          lightstick_count?: number
          proposal_id?: string
          tx_hash?: string | null
          user_id?: string
          vote_type?: string
          vote_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_proposal_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "support_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposal_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposal_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      support_proposals: {
        Row: {
          created_at: string
          description: string
          executed_at: string | null
          id: string
          min_lightstick_required: number
          pass_threshold: number
          proposal_category: string | null
          proposal_format: string
          proposal_type: string
          proposer_id: string
          quorum_threshold: number
          requested_amount: number | null
          selected_result: string | null
          status: string
          title: string
          total_vote_weight: number
          total_votes_against: number
          total_votes_for: number
          tx_hash: string | null
          updated_at: string
          voting_end_at: string
          voting_start_at: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          description: string
          executed_at?: string | null
          id?: string
          min_lightstick_required?: number
          pass_threshold?: number
          proposal_category?: string | null
          proposal_format?: string
          proposal_type?: string
          proposer_id: string
          quorum_threshold?: number
          requested_amount?: number | null
          selected_result?: string | null
          status?: string
          title: string
          total_vote_weight?: number
          total_votes_against?: number
          total_votes_for?: number
          tx_hash?: string | null
          updated_at?: string
          voting_end_at: string
          voting_start_at?: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          description?: string
          executed_at?: string | null
          id?: string
          min_lightstick_required?: number
          pass_threshold?: number
          proposal_category?: string | null
          proposal_format?: string
          proposal_type?: string
          proposer_id?: string
          quorum_threshold?: number
          requested_amount?: number | null
          selected_result?: string | null
          status?: string
          title?: string
          total_vote_weight?: number
          total_votes_against?: number
          total_votes_for?: number
          tx_hash?: string | null
          updated_at?: string
          voting_end_at?: string
          voting_start_at?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_proposals_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_history: {
        Row: {
          action: string
          client_ip: string | null
          created_at: string | null
          fee_usdc: number
          id: string
          market_id: string
          no_pool_after: number | null
          no_pool_before: number | null
          outcome: string
          price_after_yes: number | null
          price_before_yes: number | null
          shares_amount: number
          usdc_amount: number
          user_id: string
          yes_pool_after: number | null
          yes_pool_before: number | null
        }
        Insert: {
          action: string
          client_ip?: string | null
          created_at?: string | null
          fee_usdc: number
          id?: string
          market_id: string
          no_pool_after?: number | null
          no_pool_before?: number | null
          outcome: string
          price_after_yes?: number | null
          price_before_yes?: number | null
          shares_amount: number
          usdc_amount: number
          user_id: string
          yes_pool_after?: number | null
          yes_pool_before?: number | null
        }
        Update: {
          action?: string
          client_ip?: string | null
          created_at?: string | null
          fee_usdc?: number
          id?: string
          market_id?: string
          no_pool_after?: number | null
          no_pool_before?: number | null
          outcome?: string
          price_after_yes?: number | null
          price_before_yes?: number | null
          shares_amount?: number
          usdc_amount?: number
          user_id?: string
          yes_pool_after?: number | null
          yes_pool_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "swap_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      system_jobs: {
        Row: {
          completed_at: string | null
          id: string
          metadata: Json | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          id: string
          metadata?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      translation_cache: {
        Row: {
          created_at: string
          id: string
          source_hash: string
          source_text: string
          target_language: string
          translated_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_hash: string
          source_text: string
          target_language: string
          translated_text: string
        }
        Update: {
          created_at?: string
          id?: string
          source_hash?: string
          source_text?: string
          target_language?: string
          translated_text?: string
        }
        Relationships: []
      }
      usdc_balances: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usdc_deposits: {
        Row: {
          amount: number
          created_at: string
          from_address: string
          id: string
          status: string
          tx_hash: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_address: string
          id?: string
          status?: string
          tx_hash: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_address?: string
          id?: string
          status?: string
          tx_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      usdc_transactions: {
        Row: {
          amount: number
          created_at: string
          fee: number
          id: string
          reference_id: string | null
          status: string
          transaction_type: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee?: number
          id?: string
          reference_id?: string | null
          status?: string
          transaction_type: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee?: number
          id?: string
          reference_id?: string | null
          status?: string
          transaction_type?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_agent_rules: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          is_enabled: boolean
          rule_type: string
          updated_at: string
          user_agent_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          rule_type: string
          updated_at?: string
          user_agent_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          rule_type?: string
          updated_at?: string
          user_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agent_rules_user_agent_id_fkey"
            columns: ["user_agent_id"]
            isOneToOne: false
            referencedRelation: "user_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agents: {
        Row: {
          avatar_emoji: string
          avatar_url: string | null
          created_at: string
          favorite_entry_id: string | null
          id: string
          is_active: boolean
          name: string
          personality: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_emoji?: string
          avatar_url?: string | null
          created_at?: string
          favorite_entry_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          personality?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_emoji?: string
          avatar_url?: string | null
          created_at?: string
          favorite_entry_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          personality?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agents_favorite_entry_id_fkey"
            columns: ["favorite_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bans: {
        Row: {
          banned_at: string
          banned_by: string
          created_at: string
          expires_at: string | null
          id: string
          is_permanent: boolean | null
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_at?: string
          banned_by: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_permanent?: boolean | null
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_permanent?: boolean | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_fingerprints: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_gift_badge_inventory: {
        Row: {
          created_at: string
          gift_badge_id: string
          id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gift_badge_id: string
          id?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gift_badge_id?: string
          id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_gift_badge_inventory_gift_badge_id_fkey"
            columns: ["gift_badge_id"]
            isOneToOne: false
            referencedRelation: "gift_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_gift_badge_inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_gift_badge_inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_login_ips: {
        Row: {
          created_at: string
          last_ip: string | null
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_ip?: string | null
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_ip?: string | null
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reported_user_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reported_user_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reported_user_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: []
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
      user_shares: {
        Row: {
          cost_basis_usdc: number
          id: string
          market_id: string
          outcome: string
          shares: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cost_basis_usdc?: number
          id?: string
          market_id: string
          outcome: string
          shares?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cost_basis_usdc?: number
          id?: string
          market_id?: string
          outcome?: string
          shares?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_shares_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_agent_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          title: string
          user_id: string
          wiki_entry_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          title: string
          user_id: string
          wiki_entry_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          title?: string
          user_id?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_agent_alerts_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_agent_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      v3_agent_configs: {
        Row: {
          agent_emoji: string
          agent_name: string
          created_at: string
          favorite_artist_id: string | null
          features_enabled: Json
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_emoji?: string
          agent_name?: string
          created_at?: string
          favorite_artist_id?: string | null
          features_enabled?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_emoji?: string
          agent_name?: string
          created_at?: string
          favorite_artist_id?: string | null
          features_enabled?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_agent_configs_favorite_artist_id_fkey"
            columns: ["favorite_artist_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_artist_milestones: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          milestone_date: string
          milestone_type: string
          value: number | null
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          milestone_date?: string
          milestone_type: string
          value?: number | null
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          milestone_date?: string
          milestone_type?: string
          value?: number | null
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_artist_milestones_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_artist_tiers: {
        Row: {
          aliases: string[] | null
          created_at: string
          deezer_artist_id: string | null
          display_name: string | null
          id: string
          image_url: string | null
          instagram_handle: string | null
          is_manual_override: boolean
          lastfm_artist_name: string | null
          latest_youtube_updated_at: string | null
          latest_youtube_video_id: string | null
          latest_youtube_video_title: string | null
          melon_artist_name: string | null
          name_ko: string | null
          promoted_at: string | null
          social_radar_name: string | null
          spotify_artist_id: string | null
          spotify_artist_name: string | null
          tier: number
          tiktok_handle: string | null
          updated_at: string
          wiki_entry_id: string
          x_handle: string | null
          youtube_channel_id: string | null
          youtube_topic_channel_id: string | null
        }
        Insert: {
          aliases?: string[] | null
          created_at?: string
          deezer_artist_id?: string | null
          display_name?: string | null
          id?: string
          image_url?: string | null
          instagram_handle?: string | null
          is_manual_override?: boolean
          lastfm_artist_name?: string | null
          latest_youtube_updated_at?: string | null
          latest_youtube_video_id?: string | null
          latest_youtube_video_title?: string | null
          melon_artist_name?: string | null
          name_ko?: string | null
          promoted_at?: string | null
          social_radar_name?: string | null
          spotify_artist_id?: string | null
          spotify_artist_name?: string | null
          tier?: number
          tiktok_handle?: string | null
          updated_at?: string
          wiki_entry_id: string
          x_handle?: string | null
          youtube_channel_id?: string | null
          youtube_topic_channel_id?: string | null
        }
        Update: {
          aliases?: string[] | null
          created_at?: string
          deezer_artist_id?: string | null
          display_name?: string | null
          id?: string
          image_url?: string | null
          instagram_handle?: string | null
          is_manual_override?: boolean
          lastfm_artist_name?: string | null
          latest_youtube_updated_at?: string | null
          latest_youtube_video_id?: string | null
          latest_youtube_video_title?: string | null
          melon_artist_name?: string | null
          name_ko?: string | null
          promoted_at?: string | null
          social_radar_name?: string | null
          spotify_artist_id?: string | null
          spotify_artist_name?: string | null
          tier?: number
          tiktok_handle?: string | null
          updated_at?: string
          wiki_entry_id?: string
          x_handle?: string | null
          youtube_channel_id?: string | null
          youtube_topic_channel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_artist_tiers_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_energy_baselines: {
        Row: {
          avg_energy_30d: number | null
          avg_energy_7d: number | null
          avg_intensity_30d: number | null
          avg_intensity_7d: number | null
          avg_velocity_30d: number | null
          avg_velocity_7d: number | null
          id: string
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          avg_energy_30d?: number | null
          avg_energy_7d?: number | null
          avg_intensity_30d?: number | null
          avg_intensity_7d?: number | null
          avg_velocity_30d?: number | null
          avg_velocity_7d?: number | null
          id?: string
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          avg_energy_30d?: number | null
          avg_energy_7d?: number | null
          avg_intensity_30d?: number | null
          avg_intensity_7d?: number | null
          avg_velocity_30d?: number | null
          avg_velocity_7d?: number | null
          id?: string
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_energy_baselines_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_energy_baselines_v2: {
        Row: {
          avg_energy_30d: number | null
          avg_energy_7d: number | null
          avg_intensity_30d: number | null
          avg_intensity_7d: number | null
          avg_velocity_30d: number | null
          avg_velocity_7d: number | null
          id: string
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          avg_energy_30d?: number | null
          avg_energy_7d?: number | null
          avg_intensity_30d?: number | null
          avg_intensity_7d?: number | null
          avg_velocity_30d?: number | null
          avg_velocity_7d?: number | null
          id?: string
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          avg_energy_30d?: number | null
          avg_energy_7d?: number | null
          avg_intensity_30d?: number | null
          avg_intensity_7d?: number | null
          avg_velocity_30d?: number | null
          avg_velocity_7d?: number | null
          id?: string
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_energy_baselines_v2_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_energy_snapshots: {
        Row: {
          buzz_engagement_rate: number | null
          buzz_mentions_6h: number | null
          energy_score: number
          id: string
          intensity_score: number
          raw_data: Json | null
          snapshot_at: string
          velocity_score: number
          wiki_entry_id: string
          youtube_engagement_rate: number | null
          youtube_views_24h: number | null
        }
        Insert: {
          buzz_engagement_rate?: number | null
          buzz_mentions_6h?: number | null
          energy_score?: number
          id?: string
          intensity_score?: number
          raw_data?: Json | null
          snapshot_at?: string
          velocity_score?: number
          wiki_entry_id: string
          youtube_engagement_rate?: number | null
          youtube_views_24h?: number | null
        }
        Update: {
          buzz_engagement_rate?: number | null
          buzz_mentions_6h?: number | null
          energy_score?: number
          id?: string
          intensity_score?: number
          raw_data?: Json | null
          snapshot_at?: string
          velocity_score?: number
          wiki_entry_id?: string
          youtube_engagement_rate?: number | null
          youtube_views_24h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_energy_snapshots_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_energy_snapshots_v2: {
        Row: {
          album_intensity: number | null
          album_score: number | null
          album_velocity: number | null
          buzz_intensity: number | null
          buzz_score: number | null
          buzz_velocity: number | null
          energy_score: number
          fan_intensity: number | null
          fan_score: number | null
          fan_velocity: number | null
          id: string
          is_baseline: boolean
          music_intensity: number | null
          music_score: number | null
          music_velocity: number | null
          snapshot_at: string
          social_intensity: number | null
          social_score: number | null
          social_velocity: number | null
          wiki_entry_id: string
          youtube_intensity: number | null
          youtube_score: number | null
          youtube_velocity: number | null
        }
        Insert: {
          album_intensity?: number | null
          album_score?: number | null
          album_velocity?: number | null
          buzz_intensity?: number | null
          buzz_score?: number | null
          buzz_velocity?: number | null
          energy_score?: number
          fan_intensity?: number | null
          fan_score?: number | null
          fan_velocity?: number | null
          id?: string
          is_baseline?: boolean
          music_intensity?: number | null
          music_score?: number | null
          music_velocity?: number | null
          snapshot_at?: string
          social_intensity?: number | null
          social_score?: number | null
          social_velocity?: number | null
          wiki_entry_id: string
          youtube_intensity?: number | null
          youtube_score?: number | null
          youtube_velocity?: number | null
        }
        Update: {
          album_intensity?: number | null
          album_score?: number | null
          album_velocity?: number | null
          buzz_intensity?: number | null
          buzz_score?: number | null
          buzz_velocity?: number | null
          energy_score?: number
          fan_intensity?: number | null
          fan_score?: number | null
          fan_velocity?: number | null
          id?: string
          is_baseline?: boolean
          music_intensity?: number | null
          music_score?: number | null
          music_velocity?: number | null
          snapshot_at?: string
          social_intensity?: number | null
          social_score?: number | null
          social_velocity?: number | null
          wiki_entry_id?: string
          youtube_intensity?: number | null
          youtube_score?: number | null
          youtube_velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_energy_snapshots_v2_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_lightstick_balances: {
        Row: {
          balance: number
          cooldown_until: string | null
          correct_count: number
          created_at: string
          id: string
          level: number
          updated_at: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          balance?: number
          cooldown_until?: string | null
          correct_count?: number
          created_at?: string
          id?: string
          level?: number
          updated_at?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          balance?: number
          cooldown_until?: string | null
          correct_count?: number
          created_at?: string
          id?: string
          level?: number
          updated_at?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_lightstick_balances_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_quiz_bets: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_correct: boolean | null
          level_after: number | null
          level_before: number | null
          lightstick_bet: number
          quiz_id: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          level_after?: number | null
          level_before?: number | null
          lightstick_bet?: number
          quiz_id: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          level_after?: number | null
          level_before?: number | null
          lightstick_bet?: number
          quiz_id?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_quiz_bets_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "v3_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_quiz_bets_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_quizzes: {
        Row: {
          correct_answer: string
          created_at: string
          created_by: string | null
          difficulty: number | null
          end_time: string
          id: string
          options: Json | null
          question: string
          quiz_type: string
          start_time: string
          status: string
          wiki_entry_id: string | null
        }
        Insert: {
          correct_answer: string
          created_at?: string
          created_by?: string | null
          difficulty?: number | null
          end_time: string
          id?: string
          options?: Json | null
          question: string
          quiz_type?: string
          start_time?: string
          status?: string
          wiki_entry_id?: string | null
        }
        Update: {
          correct_answer?: string
          created_at?: string
          created_by?: string | null
          difficulty?: number | null
          end_time?: string
          id?: string
          options?: Json | null
          question?: string
          quiz_type?: string
          start_time?: string
          status?: string
          wiki_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_quizzes_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_scores: {
        Row: {
          album_sales_data: Json | null
          album_sales_score: number | null
          album_sales_updated_at: string | null
          buzz_data: Json | null
          buzz_mentions: number | null
          buzz_score: number | null
          buzz_sentiment: string | null
          buzz_updated_at: string | null
          energy_change_24h: number | null
          energy_rank: number | null
          energy_score: number | null
          id: string
          music_data: Json | null
          music_score: number | null
          music_updated_at: string | null
          raw_data: Json | null
          scored_at: string
          spotify_score: number | null
          tiktok_score: number | null
          total_score: number | null
          wiki_entry_id: string
          youtube_score: number | null
        }
        Insert: {
          album_sales_data?: Json | null
          album_sales_score?: number | null
          album_sales_updated_at?: string | null
          buzz_data?: Json | null
          buzz_mentions?: number | null
          buzz_score?: number | null
          buzz_sentiment?: string | null
          buzz_updated_at?: string | null
          energy_change_24h?: number | null
          energy_rank?: number | null
          energy_score?: number | null
          id?: string
          music_data?: Json | null
          music_score?: number | null
          music_updated_at?: string | null
          raw_data?: Json | null
          scored_at?: string
          spotify_score?: number | null
          tiktok_score?: number | null
          total_score?: number | null
          wiki_entry_id: string
          youtube_score?: number | null
        }
        Update: {
          album_sales_data?: Json | null
          album_sales_score?: number | null
          album_sales_updated_at?: string | null
          buzz_data?: Json | null
          buzz_mentions?: number | null
          buzz_score?: number | null
          buzz_sentiment?: string | null
          buzz_updated_at?: string | null
          energy_change_24h?: number | null
          energy_rank?: number | null
          energy_score?: number | null
          id?: string
          music_data?: Json | null
          music_score?: number | null
          music_updated_at?: string | null
          raw_data?: Json | null
          scored_at?: string
          spotify_score?: number | null
          tiktok_score?: number | null
          total_score?: number | null
          wiki_entry_id?: string
          youtube_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_scores_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_scores_v2: {
        Row: {
          album_change_24h: number | null
          album_sales_score: number | null
          buzz_change_24h: number | null
          buzz_score: number | null
          energy_change_24h: number | null
          energy_rank: number | null
          energy_score: number | null
          fan_change_24h: number | null
          fan_score: number | null
          id: string
          music_change_24h: number | null
          music_score: number | null
          scored_at: string
          social_change_24h: number | null
          social_score: number | null
          total_score: number | null
          wiki_entry_id: string
          youtube_change_24h: number | null
          youtube_score: number | null
        }
        Insert: {
          album_change_24h?: number | null
          album_sales_score?: number | null
          buzz_change_24h?: number | null
          buzz_score?: number | null
          energy_change_24h?: number | null
          energy_rank?: number | null
          energy_score?: number | null
          fan_change_24h?: number | null
          fan_score?: number | null
          id?: string
          music_change_24h?: number | null
          music_score?: number | null
          scored_at?: string
          social_change_24h?: number | null
          social_score?: number | null
          total_score?: number | null
          wiki_entry_id: string
          youtube_change_24h?: number | null
          youtube_score?: number | null
        }
        Update: {
          album_change_24h?: number | null
          album_sales_score?: number | null
          buzz_change_24h?: number | null
          buzz_score?: number | null
          energy_change_24h?: number | null
          energy_rank?: number | null
          energy_score?: number | null
          fan_change_24h?: number | null
          fan_score?: number | null
          id?: string
          music_change_24h?: number | null
          music_score?: number | null
          scored_at?: string
          social_change_24h?: number | null
          social_score?: number | null
          total_score?: number | null
          wiki_entry_id?: string
          youtube_change_24h?: number | null
          youtube_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_scores_v2_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_trend_score_history: {
        Row: {
          id: string
          snapshot_at: string
          spotify_score: number | null
          tiktok_score: number | null
          total_score: number
          twitter_score: number | null
          wiki_entry_id: string
          youtube_score: number | null
        }
        Insert: {
          id?: string
          snapshot_at?: string
          spotify_score?: number | null
          tiktok_score?: number | null
          total_score: number
          twitter_score?: number | null
          wiki_entry_id: string
          youtube_score?: number | null
        }
        Update: {
          id?: string
          snapshot_at?: string
          spotify_score?: number | null
          tiktok_score?: number | null
          total_score?: number
          twitter_score?: number | null
          wiki_entry_id?: string
          youtube_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_trend_score_history_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_trend_scores: {
        Row: {
          id: string
          raw_data: Json | null
          score_change_24h: number | null
          spotify_score: number | null
          tiktok_score: number | null
          total_score: number | null
          twitter_score: number | null
          updated_at: string
          wiki_entry_id: string
          youtube_score: number | null
        }
        Insert: {
          id?: string
          raw_data?: Json | null
          score_change_24h?: number | null
          spotify_score?: number | null
          tiktok_score?: number | null
          total_score?: number | null
          twitter_score?: number | null
          updated_at?: string
          wiki_entry_id: string
          youtube_score?: number | null
        }
        Update: {
          id?: string
          raw_data?: Json | null
          score_change_24h?: number | null
          spotify_score?: number | null
          tiktok_score?: number | null
          total_score?: number | null
          twitter_score?: number | null
          updated_at?: string
          wiki_entry_id?: string
          youtube_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_trend_scores_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: true
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_agents: {
        Row: {
          created_at: string
          daily_limit_usd: number
          daily_tx_limit: number
          id: string
          metadata: Json | null
          paymaster_approved: boolean
          social_avatar_url: string | null
          social_id: string
          social_provider: string
          social_username: string | null
          status: Database["public"]["Enums"]["agent_status"]
          updated_at: string
          verified_at: string | null
          wallet_address: string
        }
        Insert: {
          created_at?: string
          daily_limit_usd?: number
          daily_tx_limit?: number
          id?: string
          metadata?: Json | null
          paymaster_approved?: boolean
          social_avatar_url?: string | null
          social_id: string
          social_provider: string
          social_username?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          updated_at?: string
          verified_at?: string | null
          wallet_address: string
        }
        Update: {
          created_at?: string
          daily_limit_usd?: number
          daily_tx_limit?: number
          id?: string
          metadata?: Json | null
          paymaster_approved?: boolean
          social_avatar_url?: string | null
          social_id?: string
          social_provider?: string
          social_username?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          updated_at?: string
          verified_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      vesting_schedules: {
        Row: {
          beneficiary_address: string
          beneficiary_user_id: string | null
          claimed_amount: number
          cliff_duration_days: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          onchain_schedule_id: number | null
          revoke_tx_hash: string | null
          revoked_at: string | null
          start_time: string
          status: string
          total_amount: number
          tx_hash: string | null
          updated_at: string
          vesting_duration_days: number
        }
        Insert: {
          beneficiary_address: string
          beneficiary_user_id?: string | null
          claimed_amount?: number
          cliff_duration_days?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          onchain_schedule_id?: number | null
          revoke_tx_hash?: string | null
          revoked_at?: string | null
          start_time?: string
          status?: string
          total_amount: number
          tx_hash?: string | null
          updated_at?: string
          vesting_duration_days: number
        }
        Update: {
          beneficiary_address?: string
          beneficiary_user_id?: string | null
          claimed_amount?: number
          cliff_duration_days?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          onchain_schedule_id?: number | null
          revoke_tx_hash?: string | null
          revoked_at?: string | null
          start_time?: string
          status?: string
          total_amount?: number
          tx_hash?: string | null
          updated_at?: string
          vesting_duration_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "vesting_schedules_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vesting_schedules_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vesting_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vesting_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_daily_usage: {
        Row: {
          gas_sponsored_usd: number
          id: string
          total_volume_usd: number
          transaction_count: number
          updated_at: string
          usage_date: string
          voucher_id: string
        }
        Insert: {
          gas_sponsored_usd?: number
          id?: string
          total_volume_usd?: number
          transaction_count?: number
          updated_at?: string
          usage_date?: string
          voucher_id: string
        }
        Update: {
          gas_sponsored_usd?: number
          id?: string
          total_volume_usd?: number
          transaction_count?: number
          updated_at?: string
          usage_date?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_daily_usage_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "gas_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_addresses: {
        Row: {
          created_at: string
          id: string
          network: string
          updated_at: string
          user_id: string
          wallet_address: string
          wallet_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          network?: string
          updated_at?: string
          user_id: string
          wallet_address: string
          wallet_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          network?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
          wallet_type?: string
        }
        Relationships: []
      }
      wallet_private_keys: {
        Row: {
          created_at: string
          encrypted_private_key: string
          id: string
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          encrypted_private_key: string
          id?: string
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          encrypted_private_key?: string
          id?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      wiki_categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      wiki_edit_history: {
        Row: {
          created_at: string
          edit_summary: string | null
          editor_id: string
          id: string
          new_content: string
          new_image_url: string | null
          new_is_verified: boolean | null
          new_metadata: Json | null
          new_schema_type:
            | Database["public"]["Enums"]["wiki_schema_type"]
            | null
          new_title: string | null
          previous_content: string
          previous_image_url: string | null
          previous_is_verified: boolean | null
          previous_metadata: Json | null
          previous_schema_type:
            | Database["public"]["Enums"]["wiki_schema_type"]
            | null
          previous_title: string | null
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          edit_summary?: string | null
          editor_id: string
          id?: string
          new_content: string
          new_image_url?: string | null
          new_is_verified?: boolean | null
          new_metadata?: Json | null
          new_schema_type?:
            | Database["public"]["Enums"]["wiki_schema_type"]
            | null
          new_title?: string | null
          previous_content: string
          previous_image_url?: string | null
          previous_is_verified?: boolean | null
          previous_metadata?: Json | null
          previous_schema_type?:
            | Database["public"]["Enums"]["wiki_schema_type"]
            | null
          previous_title?: string | null
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          edit_summary?: string | null
          editor_id?: string
          id?: string
          new_content?: string
          new_image_url?: string | null
          new_is_verified?: boolean | null
          new_metadata?: Json | null
          new_schema_type?:
            | Database["public"]["Enums"]["wiki_schema_type"]
            | null
          new_title?: string | null
          previous_content?: string
          previous_image_url?: string | null
          previous_is_verified?: boolean | null
          previous_metadata?: Json | null
          previous_schema_type?:
            | Database["public"]["Enums"]["wiki_schema_type"]
            | null
          previous_title?: string | null
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_wiki_entry"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_edit_history_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_edit_history_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_edit_history_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entries: {
        Row: {
          aggregated_follower_count: number | null
          aggregated_trending_score: number | null
          aggregated_view_count: number | null
          aggregated_votes: number | null
          birth_date: string | null
          blood_type: string | null
          boosted_at: string | null
          boosted_until: string | null
          community_name: string | null
          content: string
          created_at: string
          creator_id: string
          event_score_offset: number
          follower_count: number
          gender: string | null
          height: number | null
          id: string
          image_url: string | null
          is_boosted: boolean | null
          is_pinned: boolean | null
          is_verified: boolean
          last_edited_at: string | null
          last_edited_by: string | null
          likes_count: number
          metadata: Json | null
          nationality: string | null
          og_image_url: string | null
          owner_id: string | null
          page_status: Database["public"]["Enums"]["page_status"]
          pinned_at: string | null
          pinned_by: string | null
          real_name: string | null
          schema_type: Database["public"]["Enums"]["wiki_schema_type"]
          slug: string
          title: string
          trending_score: number
          updated_at: string
          view_count: number
          votes: number
          weight: number | null
        }
        Insert: {
          aggregated_follower_count?: number | null
          aggregated_trending_score?: number | null
          aggregated_view_count?: number | null
          aggregated_votes?: number | null
          birth_date?: string | null
          blood_type?: string | null
          boosted_at?: string | null
          boosted_until?: string | null
          community_name?: string | null
          content: string
          created_at?: string
          creator_id: string
          event_score_offset?: number
          follower_count?: number
          gender?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_boosted?: boolean | null
          is_pinned?: boolean | null
          is_verified?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          likes_count?: number
          metadata?: Json | null
          nationality?: string | null
          og_image_url?: string | null
          owner_id?: string | null
          page_status?: Database["public"]["Enums"]["page_status"]
          pinned_at?: string | null
          pinned_by?: string | null
          real_name?: string | null
          schema_type: Database["public"]["Enums"]["wiki_schema_type"]
          slug: string
          title: string
          trending_score?: number
          updated_at?: string
          view_count?: number
          votes?: number
          weight?: number | null
        }
        Update: {
          aggregated_follower_count?: number | null
          aggregated_trending_score?: number | null
          aggregated_view_count?: number | null
          aggregated_votes?: number | null
          birth_date?: string | null
          blood_type?: string | null
          boosted_at?: string | null
          boosted_until?: string | null
          community_name?: string | null
          content?: string
          created_at?: string
          creator_id?: string
          event_score_offset?: number
          follower_count?: number
          gender?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_boosted?: boolean | null
          is_pinned?: boolean | null
          is_verified?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          likes_count?: number
          metadata?: Json | null
          nationality?: string | null
          og_image_url?: string | null
          owner_id?: string | null
          page_status?: Database["public"]["Enums"]["page_status"]
          pinned_at?: string | null
          pinned_by?: string | null
          real_name?: string | null
          schema_type?: Database["public"]["Enums"]["wiki_schema_type"]
          slug?: string
          title?: string
          trending_score?: number
          updated_at?: string
          view_count?: number
          votes?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entries_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entries_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_chat_messages: {
        Row: {
          chatroom_id: string
          created_at: string
          id: string
          original_language: string | null
          original_message: string
          translated_message: string
          user_id: string
        }
        Insert: {
          chatroom_id: string
          created_at?: string
          id?: string
          original_language?: string | null
          original_message: string
          translated_message: string
          user_id: string
        }
        Update: {
          chatroom_id?: string
          created_at?: string
          id?: string
          original_language?: string | null
          original_message?: string
          translated_message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_chat_messages_chatroom_id_fkey"
            columns: ["chatroom_id"]
            isOneToOne: false
            referencedRelation: "wiki_entry_chatrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_chatrooms: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_chatrooms_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_chatrooms_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_chatrooms_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_followers: {
        Row: {
          created_at: string
          id: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_followers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_followers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_followers_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_gift_badges: {
        Row: {
          created_at: string
          gift_badge_id: string
          giver_user_id: string
          id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          gift_badge_id: string
          giver_user_id: string
          id?: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          gift_badge_id?: string
          giver_user_id?: string
          id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_gift_badges_gift_badge_id_fkey"
            columns: ["gift_badge_id"]
            isOneToOne: false
            referencedRelation: "gift_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_gift_badges_giver_user_id_fkey"
            columns: ["giver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_gift_badges_giver_user_id_fkey"
            columns: ["giver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_gift_badges_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_likes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_likes_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_rankings: {
        Row: {
          created_at: string
          id: string
          rank: number
          snapshot_at: string
          sort_type: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rank: number
          snapshot_at?: string
          sort_type: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rank?: number
          snapshot_at?: string
          sort_type?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_rankings_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_relationships: {
        Row: {
          child_entry_id: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json | null
          parent_entry_id: string
          relationship_type: string
        }
        Insert: {
          child_entry_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          parent_entry_id: string
          relationship_type: string
        }
        Update: {
          child_entry_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          parent_entry_id?: string
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_relationships_child_entry_id_fkey"
            columns: ["child_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_relationships_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_roles_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_tags: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "wiki_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_tags_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_user_contributions: {
        Row: {
          comments_count: number
          contribution_score: number
          created_at: string
          fanz_tokens_purchased: number | null
          id: string
          posts_count: number
          updated_at: string
          user_id: string
          votes_received: number
          wiki_entry_id: string
        }
        Insert: {
          comments_count?: number
          contribution_score?: number
          created_at?: string
          fanz_tokens_purchased?: number | null
          id?: string
          posts_count?: number
          updated_at?: string
          user_id: string
          votes_received?: number
          wiki_entry_id: string
        }
        Update: {
          comments_count?: number
          contribution_score?: number
          created_at?: string
          fanz_tokens_purchased?: number | null
          id?: string
          posts_count?: number
          updated_at?: string
          user_id?: string
          votes_received?: number
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_user_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_user_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_entry_user_contributions_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_entry_votes: {
        Row: {
          created_at: string
          id: string
          tx_hash: string | null
          updated_at: string
          user_id: string
          vote_date: string
          vote_type: Database["public"]["Enums"]["vote_type"]
          wiki_entry_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          vote_date?: string
          vote_type: Database["public"]["Enums"]["vote_type"]
          wiki_entry_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          vote_date?: string
          vote_type?: Database["public"]["Enums"]["vote_type"]
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entry_votes_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_gallery: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          media_type: string
          media_url: string
          updated_at: string
          user_id: string
          wiki_entry_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          media_type: string
          media_url: string
          updated_at?: string
          user_id: string
          wiki_entry_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          updated_at?: string
          user_id?: string
          wiki_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_gallery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_gallery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_gallery_wiki_entry_id_fkey"
            columns: ["wiki_entry_id"]
            isOneToOne: false
            referencedRelation: "wiki_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_tags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          usage_count?: number
        }
        Relationships: []
      }
      withdrawal_gas_transfers: {
        Row: {
          created_at: string
          eth_amount: number
          id: string
          tx_hash: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          eth_amount?: number
          id?: string
          tx_hash?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          eth_amount?: number
          id?: string
          tx_hash?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          fee_tx_hash: string | null
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          stripe_account_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee_tx_hash?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          stripe_account_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_tx_hash?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          stripe_account_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      youtube_external_channels: {
        Row: {
          category: string
          channel_id: string
          channel_title: string
          created_at: string
          id: string
          is_active: boolean
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          channel_id: string
          channel_title: string
          created_at?: string
          id?: string
          is_active?: boolean
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          channel_id?: string
          channel_title?: string
          created_at?: string
          id?: string
          is_active?: boolean
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      external_wallet_users_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          source: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          source?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          source?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_wallet_profiles_public_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "external_wallet_users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          available_points: number | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          current_level: number | null
          display_name: string | null
          id: string | null
          invitation_verified: boolean | null
          is_verified: boolean | null
          is_vip: boolean | null
          total_points: number | null
          updated_at: string | null
          username: string | null
          verification_type: string | null
        }
        Insert: {
          available_points?: number | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          current_level?: number | null
          display_name?: string | null
          id?: string | null
          invitation_verified?: boolean | null
          is_verified?: boolean | null
          is_vip?: boolean | null
          total_points?: number | null
          updated_at?: string | null
          username?: string | null
          verification_type?: string | null
        }
        Update: {
          available_points?: number | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          current_level?: number | null
          display_name?: string | null
          id?: string | null
          invitation_verified?: boolean | null
          is_verified?: boolean | null
          is_vip?: boolean | null
          total_points?: number | null
          updated_at?: string | null
          username?: string | null
          verification_type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_badge_to_inventory: {
        Args: {
          badge_id_param: string
          quantity_param?: number
          user_id_param: string
        }
        Returns: boolean
      }
      add_wiki_schema_type_if_not_exists: {
        Args: { new_value: string }
        Returns: undefined
      }
      assign_entry_owner: {
        Args: {
          entry_id_param: string
          owner_id_param: string
          status_param?: Database["public"]["Enums"]["page_status"]
        }
        Returns: boolean
      }
      auto_close_expired_markets: { Args: never; Returns: undefined }
      award_daily_login_bonus: {
        Args: { user_id_param: string }
        Returns: boolean
      }
      award_points:
        | {
            Args: {
              action_type_param: string
              reference_id_param?: string
              user_id_param: string
            }
            Returns: undefined
          }
        | {
            Args: {
              action_type_param: string
              reference_id_param?: string
              user_id_param: string
            }
            Returns: undefined
          }
      boost_post: {
        Args: { duration_hours: number; post_id_param: string }
        Returns: boolean
      }
      boost_wiki_entry: {
        Args: { duration_hours: number; wiki_entry_id_param: string }
        Returns: boolean
      }
      calculate_aggregated_scores: {
        Args: { entry_id_param: string }
        Returns: undefined
      }
      calculate_fan_tier: { Args: { thrown_count: number }; Returns: string }
      calculate_fanz_buy_cost: {
        Args: { amount_param?: number; token_id_param: string }
        Returns: number
      }
      calculate_fanz_token_price: {
        Args: { supply_param?: number; token_id_param: string }
        Returns: number
      }
      calculate_fanz_token_score: {
        Args: { entry_id_param: string; entry_type_param: string }
        Returns: number
      }
      calculate_post_trending_score: {
        Args: { post_id_param: string }
        Returns: number
      }
      calculate_post_votes: { Args: { post_id_param: string }; Returns: number }
      calculate_vote_weight: {
        Args: { lightstick_count: number }
        Returns: number
      }
      calculate_wiki_badge_score: {
        Args: { wiki_entry_id_param: string }
        Returns: number
      }
      can_edit_wiki_entry: {
        Args: { _edit_type: string; _user_id: string; _wiki_entry_id: string }
        Returns: boolean
      }
      cancel_market: {
        Args: { p_admin_id: string; p_market_id: string }
        Returns: Json
      }
      check_agent_daily_limit: {
        Args: { _agent_id: string; _amount_usd: number }
        Returns: boolean
      }
      check_and_complete_quest: {
        Args: {
          quest_type_param: string
          reference_data?: Json
          user_id_param: string
        }
        Returns: boolean
      }
      check_and_increment_vote_count: {
        Args: {
          target_id_param?: string
          target_type_param?: string
          user_id_param: string
        }
        Returns: {
          can_vote: boolean
          current_level: number
          is_first_vote_today: boolean
          max_votes: number
          remaining_votes: number
        }[]
      }
      check_fingerprint_limit: {
        Args: { p_fingerprint: string; p_window_hours?: number }
        Returns: Json
      }
      check_ip_rate_limit: {
        Args: {
          p_action_type: string
          p_ip_hash: string
          p_max_attempts?: number
          p_reference_id?: string
          p_window_hours?: number
        }
        Returns: Json
      }
      check_voucher_daily_limit: {
        Args: { _amount_usd: number; _voucher_code: string }
        Returns: Json
      }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      create_notification: {
        Args: {
          actor_id_param?: string
          message_param: string
          reference_id_param?: string
          title_param: string
          type_param: string
          user_id_param: string
        }
        Returns: string
      }
      deduct_points: {
        Args: {
          action_type_param: string
          reference_id_param?: string
          user_id_param: string
        }
        Returns: boolean
      }
      execute_fanztoken_purchase: {
        Args: {
          p_amount: number
          p_creator_fee: number
          p_payment_token: string
          p_payment_value: number
          p_platform_fee: number
          p_price_per_token: number
          p_token_id: string
          p_total_value: number
          p_tx_hash: string
          p_user_id: string
        }
        Returns: undefined
      }
      execute_swap: {
        Args: {
          p_action: string
          p_amount: number
          p_market_id: string
          p_outcome: string
          p_user_id: string
        }
        Returns: Json
      }
      expire_boosted_posts: { Args: never; Returns: undefined }
      generate_invitation_code: { Args: never; Returns: string }
      generate_post_slug: {
        Args: { post_id: string; post_title: string }
        Returns: string
      }
      generate_voucher_code: { Args: never; Returns: string }
      get_bot_agent_by_api_key: {
        Args: { api_key_param: string }
        Returns: {
          daily_limit_usd: number
          daily_usage: number
          id: string
          is_active: boolean
          name: string
          wallet_address: string
        }[]
      }
      get_bot_agent_daily_usage: {
        Args: { agent_id_param: string }
        Returns: number
      }
      get_daily_post_status: { Args: { user_id_param: string }; Returns: Json }
      get_daily_vote_status: { Args: { user_id_param: string }; Returns: Json }
      get_ktrenz_schedule: { Args: never; Returns: Json }
      get_next_nonce: { Args: { p_sender_address: string }; Returns: number }
      get_platform_activity_count: { Args: never; Returns: number }
      get_point_value: { Args: { action_type_param: string }; Returns: number }
      get_previous_rank: {
        Args: { post_id_param: string; sort_type_param: string }
        Returns: number
      }
      get_remaining_invitation_codes: {
        Args: { user_id_param: string }
        Returns: number
      }
      get_schema_types_with_entries: {
        Args: never
        Returns: {
          schema_type: Database["public"]["Enums"]["wiki_schema_type"]
        }[]
      }
      get_trending_artists_24h: {
        Args: { result_limit?: number }
        Returns: {
          support_count: number
          wiki_entry_id: string
        }[]
      }
      get_trending_wiki_entries: {
        Args: never
        Returns: {
          boosted_at: string
          boosted_until: string
          content: string
          created_at: string
          creator: Json
          creator_id: string
          follower_count: number
          id: string
          image_url: string
          is_boosted: boolean
          is_pinned: boolean
          is_verified: boolean
          last_edited_at: string
          last_edited_by: string
          last_editor: Json
          likes_count: number
          metadata: Json
          pinned_at: string
          pinned_by: string
          schema_type: string
          slug: string
          title: string
          trending_score: number
          updated_at: string
          view_count: number
          votes: number
        }[]
      }
      get_user_level: { Args: { _user_id: string }; Returns: number }
      get_wiki_entry_comment_count: {
        Args: { entry_id: string }
        Returns: number
      }
      give_badge_to_entry: {
        Args: { badge_id_param: string; entry_id_param: string }
        Returns: boolean
      }
      handle_comment_vote: {
        Args: {
          comment_id_param: string
          user_id_param: string
          vote_type_param: Database["public"]["Enums"]["vote_type"]
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
      has_wiki_entry_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
          _wiki_entry_id: string
        }
        Returns: boolean
      }
      increment_agent_usage: {
        Args: {
          _agent_id: string
          _amount_usd: number
          _fee_usd: number
          _tx_type: string
        }
        Returns: undefined
      }
      increment_event_vote: {
        Args: { entry_id_param: string; vote_delta: number }
        Returns: undefined
      }
      increment_ktrenz_login_count: {
        Args: { _user_id: string }
        Returns: undefined
      }
      increment_post_view_count: {
        Args: { post_id_param: string }
        Returns: undefined
      }
      increment_view_count: { Args: { entry_id: string }; Returns: undefined }
      increment_voucher_usage: {
        Args: { _amount_usd: number; _gas_usd?: number; _voucher_id: string }
        Returns: undefined
      }
      increment_wiki_entry_view_count: {
        Args: { entry_id: string }
        Returns: undefined
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      ktrenz_check_agent_usage: { Args: { _user_id: string }; Returns: Json }
      ktrenz_cleanup_knowledge_cache: { Args: never; Returns: undefined }
      ktrenz_daily_login_reward: { Args: { _user_id: string }; Returns: number }
      ktrenz_get_agent_slot_limit: { Args: { _user_id: string }; Returns: Json }
      ktrenz_get_agent_usage: { Args: { _user_id: string }; Returns: Json }
      ktrenz_purchase_agent_messages: {
        Args: { _bundle: number; _user_id: string }
        Returns: Json
      }
      ktrenz_purchase_agent_slot: { Args: { _user_id: string }; Returns: Json }
      ktrenz_record_contribution: {
        Args: { _platform: string; _user_id: string; _wiki_entry_id: string }
        Returns: undefined
      }
      manage_ktrenz_schedule: {
        Args: { p_action: string; p_hour?: number; p_minute?: number }
        Returns: Json
      }
      pin_post: { Args: { post_id_param: string }; Returns: boolean }
      pin_wiki_entry: {
        Args: { wiki_entry_id_param: string }
        Returns: boolean
      }
      process_usdc_withdrawal: {
        Args: {
          p_amount: number
          p_fee: number
          p_to_address: string
          p_user_id: string
        }
        Returns: {
          error_message: string
          new_balance: number
          previous_balance: number
          success: boolean
          transaction_id: string
        }[]
      }
      purchase_agent_messages_stars: {
        Args: { _bundle: number; _user_id: string }
        Returns: Json
      }
      revert_usdc_withdrawal: {
        Args: { p_transaction_id: string; p_user_id: string }
        Returns: boolean
      }
      revoke_entry_owner: { Args: { entry_id_param: string }; Returns: boolean }
      save_user_fingerprint: {
        Args: { p_fingerprint: string; p_user_id: string }
        Returns: undefined
      }
      settle_group_market: {
        Args: {
          p_admin_id: string
          p_correct_option_label: string
          p_group_id: string
        }
        Returns: Json
      }
      settle_market: {
        Args: {
          p_admin_id: string
          p_correct_outcome: string
          p_market_id: string
        }
        Returns: Json
      }
      unpin_post: { Args: { post_id_param: string }; Returns: boolean }
      unpin_wiki_entry: {
        Args: { wiki_entry_id_param: string }
        Returns: boolean
      }
      update_wiki_entry_contribution_score: {
        Args: {
          comments_delta?: number
          entry_id_param: string
          posts_delta?: number
          score_delta: number
          user_id_param: string
          votes_delta?: number
        }
        Returns: undefined
      }
      use_invitation_code: { Args: { code_param: string }; Returns: boolean }
      v3_calculate_lightstick_level: {
        Args: { correct_count_param: number }
        Returns: number
      }
    }
    Enums: {
      agent_status: "pending" | "verified" | "suspended"
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "entry_agent"
        | "entry_moderator"
      event_type:
        | "birthday"
        | "comeback"
        | "concert"
        | "fanmeeting"
        | "variety_appearance"
        | "award_show"
        | "other"
      page_status: "unclaimed" | "pending" | "claimed" | "verified"
      vote_type: "up" | "down"
      wiki_schema_type:
        | "artist"
        | "album"
        | "song"
        | "variety_show"
        | "event"
        | "member"
        | "actor"
        | "beauty_brand"
        | "beauty_product"
        | "restaurant"
        | "food"
        | "food_brand"
        | "food_product"
        | "news"
        | "youtuber"
        | "travel"
        | "k_beauty"
        | "k_food"
        | "expert"
        | "cafe"
        | "culturetrend"
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
      agent_status: ["pending", "verified", "suspended"],
      app_role: [
        "admin",
        "moderator",
        "user",
        "entry_agent",
        "entry_moderator",
      ],
      event_type: [
        "birthday",
        "comeback",
        "concert",
        "fanmeeting",
        "variety_appearance",
        "award_show",
        "other",
      ],
      page_status: ["unclaimed", "pending", "claimed", "verified"],
      vote_type: ["up", "down"],
      wiki_schema_type: [
        "artist",
        "album",
        "song",
        "variety_show",
        "event",
        "member",
        "actor",
        "beauty_brand",
        "beauty_product",
        "restaurant",
        "food",
        "food_brand",
        "food_product",
        "news",
        "youtuber",
        "travel",
        "k_beauty",
        "k_food",
        "expert",
        "cafe",
        "culturetrend",
      ],
    },
  },
} as const
