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
      checklist_items: {
        Row: {
          category: string
          created_at: string
          display_order: number
          done_at: string | null
          due_date: string | null
          id: string
          is_done: boolean
          notes: string | null
          priority: string
          title: string
          trip_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          display_order?: number
          done_at?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          notes?: string | null
          priority?: string
          title: string
          trip_id: string
        }
        Update: {
          category?: string
          created_at?: string
          display_order?: number
          done_at?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          notes?: string | null
          priority?: string
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      day_entries: {
        Row: {
          created_at: string
          day_id: string
          description: string | null
          display_order: number
          entry_type: Database["public"]["Enums"]["entry_type"]
          google_maps_url: string | null
          icon_emoji: string | null
          id: string
          latitude: number | null
          linked_hotel_id: string | null
          linked_recommendation_id: string | null
          location_name: string | null
          longitude: number | null
          photo_url: string | null
          time_of_day: string | null
          title: string
        }
        Insert: {
          created_at?: string
          day_id: string
          description?: string | null
          display_order?: number
          entry_type: Database["public"]["Enums"]["entry_type"]
          google_maps_url?: string | null
          icon_emoji?: string | null
          id?: string
          latitude?: number | null
          linked_hotel_id?: string | null
          linked_recommendation_id?: string | null
          location_name?: string | null
          longitude?: number | null
          photo_url?: string | null
          time_of_day?: string | null
          title: string
        }
        Update: {
          created_at?: string
          day_id?: string
          description?: string | null
          display_order?: number
          entry_type?: Database["public"]["Enums"]["entry_type"]
          google_maps_url?: string | null
          icon_emoji?: string | null
          id?: string
          latitude?: number | null
          linked_hotel_id?: string | null
          linked_recommendation_id?: string | null
          location_name?: string | null
          longitude?: number | null
          photo_url?: string | null
          time_of_day?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_entries_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_entries_linked_hotel_id_fkey"
            columns: ["linked_hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_entries_linked_recommendation_id_fkey"
            columns: ["linked_recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      day_snapshots: {
        Row: {
          created_at: string
          day_id: string
          entries: Json
          entry_count: number
          id: string
          name: string
          reason: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          day_id: string
          entries?: Json
          entry_count?: number
          id?: string
          name: string
          reason?: string
          trip_id: string
        }
        Update: {
          created_at?: string
          day_id?: string
          entries?: Json
          entry_count?: number
          id?: string
          name?: string
          reason?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_snapshots_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_snapshots_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          amount_ils: number | null
          barcode_type: string | null
          barcode_value: string | null
          created_at: string
          display_order: number
          file_url: string | null
          id: string
          is_paid: boolean
          notes: string | null
          title: string
          trip_id: string
          type: string
          valid_date: string | null
        }
        Insert: {
          amount_ils?: number | null
          barcode_type?: string | null
          barcode_value?: string | null
          created_at?: string
          display_order?: number
          file_url?: string | null
          id?: string
          is_paid?: boolean
          notes?: string | null
          title: string
          trip_id: string
          type: string
          valid_date?: string | null
        }
        Update: {
          amount_ils?: number | null
          barcode_type?: string | null
          barcode_value?: string | null
          created_at?: string
          display_order?: number
          file_url?: string | null
          id?: string
          is_paid?: boolean
          notes?: string | null
          title?: string
          trip_id?: string
          type?: string
          valid_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_foreign: number | null
          amount_ils: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          description: string | null
          expense_date: string
          foreign_currency: string | null
          id: string
          linked_hotel_id: string | null
          linked_recommendation_id: string | null
          location_name: string | null
          trip_id: string
        }
        Insert: {
          amount_foreign?: number | null
          amount_ils: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string | null
          expense_date?: string
          foreign_currency?: string | null
          id?: string
          linked_hotel_id?: string | null
          linked_recommendation_id?: string | null
          location_name?: string | null
          trip_id: string
        }
        Update: {
          amount_foreign?: number | null
          amount_ils?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string | null
          expense_date?: string
          foreign_currency?: string | null
          id?: string
          linked_hotel_id?: string | null
          linked_recommendation_id?: string | null
          location_name?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_linked_hotel_id_fkey"
            columns: ["linked_hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_recommendation_id_fkey"
            columns: ["linked_recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          address: string | null
          booking_platform: string | null
          cancellation_deadline: string | null
          checkin_date: string | null
          checkout_date: string | null
          city: string | null
          confirmation_url: string | null
          created_at: string
          google_maps_url: string | null
          hotel_name: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          photo_url: string | null
          post_stay_rating: number | null
          post_stay_review: string | null
          price_per_night_ils: number | null
          total_cost_ils: number | null
          trip_id: string
          type: Database["public"]["Enums"]["hotel_type"]
        }
        Insert: {
          address?: string | null
          booking_platform?: string | null
          cancellation_deadline?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          city?: string | null
          confirmation_url?: string | null
          created_at?: string
          google_maps_url?: string | null
          hotel_name: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          photo_url?: string | null
          post_stay_rating?: number | null
          post_stay_review?: string | null
          price_per_night_ils?: number | null
          total_cost_ils?: number | null
          trip_id: string
          type?: Database["public"]["Enums"]["hotel_type"]
        }
        Update: {
          address?: string | null
          booking_platform?: string | null
          cancellation_deadline?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          city?: string | null
          confirmation_url?: string | null
          created_at?: string
          google_maps_url?: string | null
          hotel_name?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          photo_url?: string | null
          post_stay_rating?: number | null
          post_stay_review?: string | null
          price_per_night_ils?: number | null
          total_cost_ils?: number | null
          trip_id?: string
          type?: Database["public"]["Enums"]["hotel_type"]
        }
        Relationships: [
          {
            foreignKeyName: "hotels_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_days: {
        Row: {
          city_label: string | null
          created_at: string
          date: string
          day_number: number
          id: string
          notes: string | null
          trip_id: string
          version_id: string | null
        }
        Insert: {
          city_label?: string | null
          created_at?: string
          date: string
          day_number: number
          id?: string
          notes?: string | null
          trip_id: string
          version_id?: string | null
        }
        Update: {
          city_label?: string | null
          created_at?: string
          date?: string
          day_number?: number
          id?: string
          notes?: string | null
          trip_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_days_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "itinerary_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_versions: {
        Row: {
          ai_tool: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          source: string
          trip_id: string
        }
        Insert: {
          ai_tool?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          source?: string
          trip_id: string
        }
        Update: {
          ai_tool?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          source?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_versions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          address: string | null
          booking_deadline: string | null
          booking_note: string | null
          booking_status: string | null
          booking_time: string | null
          booking_url: string | null
          city: string | null
          created_at: string
          google_maps_url: string | null
          google_rating: number | null
          google_rating_count: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          photo_url: string | null
          rating: number | null
          review: string | null
          status: Database["public"]["Enums"]["rec_status"]
          trip_id: string
          type: Database["public"]["Enums"]["rec_type"]
        }
        Insert: {
          address?: string | null
          booking_deadline?: string | null
          booking_note?: string | null
          booking_status?: string | null
          booking_time?: string | null
          booking_url?: string | null
          city?: string | null
          created_at?: string
          google_maps_url?: string | null
          google_rating?: number | null
          google_rating_count?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          photo_url?: string | null
          rating?: number | null
          review?: string | null
          status?: Database["public"]["Enums"]["rec_status"]
          trip_id: string
          type: Database["public"]["Enums"]["rec_type"]
        }
        Update: {
          address?: string | null
          booking_deadline?: string | null
          booking_note?: string | null
          booking_status?: string | null
          booking_time?: string | null
          booking_url?: string | null
          city?: string | null
          created_at?: string
          google_maps_url?: string | null
          google_rating?: number | null
          google_rating_count?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          photo_url?: string | null
          rating?: number | null
          review?: string | null
          status?: Database["public"]["Enums"]["rec_status"]
          trip_id?: string
          type?: Database["public"]["Enums"]["rec_type"]
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          base_currency: string
          foreign_currency: string
          id: string
          manual_exchange_rate: number | null
          trip_id: string
        }
        Insert: {
          base_currency?: string
          foreign_currency?: string
          id?: string
          manual_exchange_rate?: number | null
          trip_id: string
        }
        Update: {
          base_currency?: string
          foreign_currency?: string
          id?: string
          manual_exchange_rate?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          currency_code: string
          destination_country: string | null
          end_date: string
          entry_pin: string
          id: string
          num_travelers: number
          owner_id: string
          share_token: string | null
          shared_user_ids: string[]
          start_date: string
          title: string
          total_budget_ils: number
        }
        Insert: {
          created_at?: string
          currency_code?: string
          destination_country?: string | null
          end_date: string
          entry_pin: string
          id?: string
          num_travelers?: number
          owner_id: string
          share_token?: string | null
          shared_user_ids?: string[]
          start_date: string
          title: string
          total_budget_ils?: number
        }
        Update: {
          created_at?: string
          currency_code?: string
          destination_country?: string | null
          end_date?: string
          entry_pin?: string
          id?: string
          num_travelers?: number
          owner_id?: string
          share_token?: string | null
          shared_user_ids?: string[]
          start_date?: string
          title?: string
          total_budget_ils?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_trip: { Args: { _trip_id: string }; Returns: boolean }
      claim_share: { Args: { _token: string }; Returns: string }
    }
    Enums: {
      entry_type:
        | "flight"
        | "hotel_checkin"
        | "attraction"
        | "food"
        | "transport"
        | "note"
      expense_category:
        | "food"
        | "attraction"
        | "transport"
        | "shopping"
        | "accommodation"
        | "other"
      hotel_type: "hotel" | "ryokan" | "other"
      rec_status: "wishlist" | "visited" | "skipped"
      rec_type: "food" | "attraction" | "hotel"
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
      entry_type: [
        "flight",
        "hotel_checkin",
        "attraction",
        "food",
        "transport",
        "note",
      ],
      expense_category: [
        "food",
        "attraction",
        "transport",
        "shopping",
        "accommodation",
        "other",
      ],
      hotel_type: ["hotel", "ryokan", "other"],
      rec_status: ["wishlist", "visited", "skipped"],
      rec_type: ["food", "attraction", "hotel"],
    },
  },
} as const
