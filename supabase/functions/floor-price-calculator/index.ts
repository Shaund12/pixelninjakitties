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

    console.log('Starting floor price calculation...')

    // Get active listings grouped by rarity
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('token_id, price, currency_address')
      .eq('is_active', true)
      .order('price', { ascending: true })

    if (listingsError) {
      console.error('Error fetching listings:', listingsError)
      throw listingsError
    }

    console.log(`Found ${listings?.length || 0} active listings`)

    // For each listing, we need to determine the rarity
    // In a real implementation, you'd fetch NFT metadata to determine rarity
    // For now, we'll use a simple mock based on token ID ranges
    const rarityMap = {
      'Common': { min: 1, max: 5000 },
      'Uncommon': { min: 5001, max: 8000 },
      'Rare': { min: 8001, max: 9500 },
      'Epic': { min: 9501, max: 9900 },
      'Legendary': { min: 9901, max: 10000 }
    }

    const floorPrices = new Map()

    // Group listings by rarity and currency
    for (const listing of listings || []) {
      const tokenId = listing.token_id
      let rarity = 'Common'

      // Determine rarity based on token ID
      for (const [rarityName, range] of Object.entries(rarityMap)) {
        if (tokenId >= range.min && tokenId <= range.max) {
          rarity = rarityName
          break
        }
      }

      const key = `${rarity}-${listing.currency_address}`
      if (!floorPrices.has(key)) {
        floorPrices.set(key, {
          rarity,
          currency_address: listing.currency_address,
          floor_price: listing.price,
          sample_size: 1
        })
      } else {
        const current = floorPrices.get(key)
        if (listing.price < current.floor_price) {
          current.floor_price = listing.price
        }
        current.sample_size += 1
      }
    }

    console.log(`Calculated floor prices for ${floorPrices.size} rarity/currency combinations`)

    // Update floor stats in database
    const updates = []
    for (const floorData of floorPrices.values()) {
      const { error } = await supabase
        .from('floor_stats')
        .upsert({
          rarity: floorData.rarity,
          floor_price: floorData.floor_price,
          currency_address: floorData.currency_address,
          sample_size: floorData.sample_size,
          last_updated: new Date().toISOString()
        })

      if (error) {
        console.error(`Error updating floor stats for ${floorData.rarity}:`, error)
      } else {
        updates.push(floorData)
      }
    }

    console.log(`Successfully updated ${updates.length} floor price records`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Updated ${updates.length} floor price records`,
        data: updates
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error in floor price calculation:', error)
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