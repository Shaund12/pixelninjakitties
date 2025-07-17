import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Starting price alert check...')

    // Get active listings
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('token_id, price, currency_address')
      .eq('is_active', true)

    if (listingsError) {
      console.error('Error fetching listings:', listingsError)
      throw listingsError
    }

    console.log(`Found ${listings?.length || 0} active listings`)

    // Get active watchlist items
    const { data: watchlists, error: watchlistError } = await supabase
      .from('watchlists')
      .select('*')
      .eq('is_active', true)
      .is('triggered_at', null)

    if (watchlistError) {
      console.error('Error fetching watchlists:', watchlistError)
      throw watchlistError
    }

    console.log(`Found ${watchlists?.length || 0} active watchlist items`)

    const triggeredAlerts = []

    // Check each watchlist item against current listings
    for (const watchlist of watchlists || []) {
      const matchingListings = listings?.filter(
        listing => 
          listing.token_id === watchlist.token_id &&
          listing.currency_address === watchlist.currency_address
      ) || []

      for (const listing of matchingListings) {
        // Check if listing price is at or below target price
        if (watchlist.target_price && listing.price <= watchlist.target_price) {
          // Trigger alert
          const { error: updateError } = await supabase
            .from('watchlists')
            .update({
              triggered_at: new Date().toISOString()
            })
            .eq('id', watchlist.id)

          if (updateError) {
            console.error('Error updating watchlist:', updateError)
            continue
          }

          // Log activity for user notification
          const { error: logError } = await supabase
            .from('activity_logs')
            .insert({
              user_id: watchlist.user_id,
              event_type: 'price_alert_triggered',
              token_id: watchlist.token_id,
              metadata: {
                target_price: watchlist.target_price,
                current_price: listing.price,
                currency_address: listing.currency_address,
                watchlist_id: watchlist.id
              },
              timestamp: new Date().toISOString()
            })

          if (logError) {
            console.error('Error logging price alert:', logError)
          } else {
            triggeredAlerts.push({
              user_id: watchlist.user_id,
              token_id: watchlist.token_id,
              target_price: watchlist.target_price,
              current_price: listing.price
            })
          }
        }
      }
    }

    console.log(`Triggered ${triggeredAlerts.length} price alerts`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Triggered ${triggeredAlerts.length} price alerts`,
        data: triggeredAlerts
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error in price alert trigger:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})