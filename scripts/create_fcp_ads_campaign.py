"""
FCP Sports — Google Ads Campaign Creation Script
Account: 2629789119 (Florida Coastal Prep LLC — active billing, used for fcpsports.org)
Budget: $10/day
Status: PAUSED (review before activating)
Created: 2026-04-05

NOTE: Account 3223054729 ("Florida Coastal Prep") has no billing and cannot create campaigns.
"""

import warnings
warnings.filterwarnings("ignore")

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

# ─── Config ───────────────────────────────────────────────────────────────────
CUSTOMER_ID = "2629789119"  # Florida Coastal Prep LLC — active billing, used for fcpsports.org
CAMPAIGN_NAME = "FCP Sports — Local Camps & Leagues"
BUDGET_DAILY_MICROS = 10_000_000  # $10/day

# Fort Walton Beach, FL center point
GEO_LAT = 30.4057
GEO_LON = -86.6188
GEO_RADIUS_MILES = 30

PHONE_NUMBER = "850-961-2323"
PHONE_COUNTRY = "US"

# ─── Client ───────────────────────────────────────────────────────────────────
client = GoogleAdsClient.load_from_storage("~/.google-ads.yaml")
ga_service = client.get_service("GoogleAdsService")

campaign_service = client.get_service("CampaignService")
budget_service = client.get_service("CampaignBudgetService")
ad_group_service = client.get_service("AdGroupService")
ad_group_ad_service = client.get_service("AdGroupAdService")
ad_group_criterion_service = client.get_service("AdGroupCriterionService")
campaign_criterion_service = client.get_service("CampaignCriterionService")
asset_service = client.get_service("AssetService")
campaign_asset_service = client.get_service("CampaignAssetService")
campaign_conversion_goal_service = client.get_service("CampaignConversionGoalService")

# ─── Enums ────────────────────────────────────────────────────────────────────
CampaignStatusEnum = client.enums.CampaignStatusEnum
BiddingStrategyTypeEnum = client.enums.BiddingStrategyTypeEnum
AdvertisingChannelTypeEnum = client.enums.AdvertisingChannelTypeEnum
KeywordMatchTypeEnum = client.enums.KeywordMatchTypeEnum
AdGroupStatusEnum = client.enums.AdGroupStatusEnum
AdGroupAdStatusEnum = client.enums.AdGroupAdStatusEnum
CampaignCriterionStatusEnum = client.enums.CampaignCriterionStatusEnum
ProximityRadiusUnitsEnum = client.enums.ProximityRadiusUnitsEnum
AssetTypeEnum = client.enums.AssetTypeEnum
AssetFieldTypeEnum = client.enums.AssetFieldTypeEnum
ConversionActionCategoryEnum = client.enums.ConversionActionCategoryEnum
ConversionOriginEnum = client.enums.ConversionOriginEnum


def run():
    print("=" * 60)
    print("FCP Sports — Google Ads Campaign Builder")
    print(f"Account: {CUSTOMER_ID}")
    print("=" * 60)

    # ─── Step 1: Campaign Budget ──────────────────────────────────────────────
    print("\n[1] Creating campaign budget ($10/day)...")
    budget_op = client.get_type("CampaignBudgetOperation")
    budget = budget_op.create
    budget.name = "FCP Sports Budget $10/day"
    budget.amount_micros = BUDGET_DAILY_MICROS
    budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    budget.explicitly_shared = False  # Not shared — avoids bidding strategy incompatibility

    try:
        budget_response = budget_service.mutate_campaign_budgets(
            customer_id=CUSTOMER_ID, operations=[budget_op]
        )
        budget_resource = budget_response.results[0].resource_name
        print(f"  Budget created: {budget_resource}")
    except GoogleAdsException as ex:
        print(f"  ERROR creating budget: {ex}")
        raise

    # ─── Step 2: Campaign ─────────────────────────────────────────────────────
    print("\n[2] Creating campaign...")
    campaign_op = client.get_type("CampaignOperation")
    campaign = campaign_op.create
    campaign.name = CAMPAIGN_NAME
    campaign.status = CampaignStatusEnum.PAUSED
    campaign.advertising_channel_type = AdvertisingChannelTypeEnum.SEARCH
    campaign.campaign_budget = budget_resource

    # Bidding: Maximize Conversions
    campaign.maximize_conversions.target_cpa_micros = 0  # No tCPA cap yet

    # Search only — no Display, no Search Partners (keeps quality high)
    campaign.network_settings.target_google_search = True
    campaign.network_settings.target_search_network = False  # No search partners
    campaign.network_settings.target_content_network = False  # No Display

    # EU political advertising — required field
    campaign.contains_eu_political_advertising = 3  # NOT_EU_POLITICAL

    try:
        campaign_response = campaign_service.mutate_campaigns(
            customer_id=CUSTOMER_ID, operations=[campaign_op]
        )
        campaign_resource = campaign_response.results[0].resource_name
        campaign_id = campaign_resource.split("/")[-1]
        print(f"  Campaign created: {campaign_resource}")
        print(f"  Campaign ID: {campaign_id}")
    except GoogleAdsException as ex:
        print(f"  ERROR creating campaign: {ex}")
        raise

    # ─── Step 3: Geo Targeting — 30-mile radius around Fort Walton Beach ──────
    print("\n[3] Adding geo targeting (30-mile radius, Fort Walton Beach FL)...")
    geo_op = client.get_type("CampaignCriterionOperation")
    geo = geo_op.create
    geo.campaign = campaign_resource
    geo.negative = False
    geo.proximity.address.city_name = "Fort Walton Beach"
    geo.proximity.address.province_code = "FL"
    geo.proximity.address.postal_code = "32547"
    geo.proximity.address.country_code = "US"
    geo.proximity.radius = GEO_RADIUS_MILES
    geo.proximity.radius_units = ProximityRadiusUnitsEnum.MILES

    try:
        campaign_criterion_service.mutate_campaign_criteria(
            customer_id=CUSTOMER_ID, operations=[geo_op]
        )
        print(f"  Geo targeting added: {GEO_RADIUS_MILES} miles around Fort Walton Beach, FL")
    except GoogleAdsException as ex:
        print(f"  ERROR adding geo targeting: {ex}")
        # Non-fatal — log and continue

    # ─── Step 4: Campaign-Level Negative Keywords ─────────────────────────────
    print("\n[4] Adding campaign-level negative keywords...")
    negative_keywords = [
        # Wrong sports
        "soccer", "football", "baseball", "softball", "volleyball", "tennis", "swimming",
        # Wrong intent
        "jobs", "coaching jobs", "scores", "standings", "highlights", "cards", "shoes",
        # Wrong cities
        "miami", "orlando", "tampa", "jacksonville", "tallahassee",
        # Wrong level
        "college", "university", "nba", "professional", "d1 tryouts",
        # Wrong products
        "equipment", "gear", "jersey store", "uniform",
        # Budget waste
        "free",
    ]

    neg_ops = []
    for kw in negative_keywords:
        op = client.get_type("CampaignCriterionOperation")
        c = op.create
        c.campaign = campaign_resource
        c.negative = True
        c.keyword.text = kw
        c.keyword.match_type = KeywordMatchTypeEnum.BROAD  # broad negatives block more junk
        neg_ops.append(op)

    try:
        campaign_criterion_service.mutate_campaign_criteria(
            customer_id=CUSTOMER_ID, operations=neg_ops
        )
        print(f"  Added {len(negative_keywords)} negative keywords")
    except GoogleAdsException as ex:
        print(f"  ERROR adding negatives: {ex}")

    # ─── Step 5: Ad Groups ────────────────────────────────────────────────────

    # --- Ad Group 1: Camps & Training ---
    print("\n[5a] Creating Ad Group: Camps & Training...")
    ag1_op = client.get_type("AdGroupOperation")
    ag1 = ag1_op.create
    ag1.name = "Camps & Training"
    ag1.campaign = campaign_resource
    ag1.status = AdGroupStatusEnum.ENABLED
    ag1.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD

    try:
        ag1_response = ad_group_service.mutate_ad_groups(
            customer_id=CUSTOMER_ID, operations=[ag1_op]
        )
        ag1_resource = ag1_response.results[0].resource_name
        ag1_id = ag1_resource.split("/")[-1]
        print(f"  Ad Group 1 created: {ag1_resource}")
        print(f"  Ad Group 1 ID: {ag1_id}")
    except GoogleAdsException as ex:
        print(f"  ERROR creating ad group 1: {ex}")
        raise

    # Keywords for Camps & Training
    camps_keywords = [
        "basketball camp fort walton beach",
        "basketball camp destin",
        "summer basketball camp",
        "basketball training near me",
        "basketball lessons near me",
        "private basketball lessons",
        "basketball camp for kids",
        "girls basketball camp",
        "basketball camp florida",
        "youth basketball camp",
    ]

    kw_ops_1 = []
    for kw in camps_keywords:
        op = client.get_type("AdGroupCriterionOperation")
        c = op.create
        c.ad_group = ag1_resource
        c.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
        c.keyword.text = kw
        c.keyword.match_type = KeywordMatchTypeEnum.PHRASE
        kw_ops_1.append(op)

    try:
        ad_group_criterion_service.mutate_ad_group_criteria(
            customer_id=CUSTOMER_ID, operations=kw_ops_1
        )
        print(f"  Added {len(camps_keywords)} keywords to Camps & Training")
    except GoogleAdsException as ex:
        print(f"  ERROR adding keywords to ag1: {ex}")

    # RSA Ad for Camps & Training
    print("  Creating RSA ad for Camps & Training...")
    camps_headlines = [
        "Basketball Camp FWB FL",        # 22 chars
        "Summer Camp Ages 5-17",          # 21 chars
        "$149/Week All Inclusive",        # 23 chars
        "Train With Pro Coaches",         # 22 chars
        "Girls-Only Camp Available",      # 25 chars
        "Dedicated Basketball Gym",       # 24 chars
        "14,000 Sq Ft Facility",          # 21 chars
        "Early Bird Save $20",            # 19 chars
        "Military Discount $20 Off",      # 25 chars
        "Climate Controlled Gym",         # 22 chars
        "Near Destin & Niceville",        # 23 chars
        "Structured Drills & Games",      # 25 chars
        "Register Online Now",            # 19 chars
        "Spots Filling Fast",             # 18 chars
        "Trusted by 500+ Athletes",       # 24 chars
    ]

    camps_descriptions = [
        "Basketball camps in Fort Walton Beach. Ages 5-17, all skill levels. Register today.",  # 85 chars
        "Summer day camps, girls-only camps & clinics at FCP Sports. $149/week, starts June.",    # 84 chars
        "Dedicated basketball facility near Destin. Structured drills, scrimmages & film review.", # 88 chars
        "Military families get $20 off. Early bird pricing available. Limited spots each session.", # 89 chars
    ]

    # Verify char limits
    for i, h in enumerate(camps_headlines):
        if len(h) > 30:
            print(f"  WARNING: Headline {i+1} too long ({len(h)} chars): '{h}'")
    for i, d in enumerate(camps_descriptions):
        if len(d) > 90:
            print(f"  WARNING: Description {i+1} too long ({len(d)} chars): '{d}'")

    ag1_ad_op = client.get_type("AdGroupAdOperation")
    ag1_ad = ag1_ad_op.create
    ag1_ad.ad_group = ag1_resource
    ag1_ad.status = AdGroupAdStatusEnum.ENABLED

    rsa1 = ag1_ad.ad.responsive_search_ad
    for h in camps_headlines:
        asset = client.get_type("AdTextAsset")
        asset.text = h
        rsa1.headlines.append(asset)
    for d in camps_descriptions:
        asset = client.get_type("AdTextAsset")
        asset.text = d
        rsa1.descriptions.append(asset)

    ag1_ad.ad.final_urls.append("https://fcpsports.org/camps/summer-day-camp/")

    try:
        ad_group_ad_service.mutate_ad_group_ads(
            customer_id=CUSTOMER_ID, operations=[ag1_ad_op]
        )
        print("  RSA ad created for Camps & Training")
    except GoogleAdsException as ex:
        print(f"  ERROR creating RSA for ag1: {ex}")

    # --- Ad Group 2: Leagues & Open Gym ---
    print("\n[5b] Creating Ad Group: Leagues & Open Gym...")
    ag2_op = client.get_type("AdGroupOperation")
    ag2 = ag2_op.create
    ag2.name = "Leagues & Open Gym"
    ag2.campaign = campaign_resource
    ag2.status = AdGroupStatusEnum.ENABLED
    ag2.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD

    try:
        ag2_response = ad_group_service.mutate_ad_groups(
            customer_id=CUSTOMER_ID, operations=[ag2_op]
        )
        ag2_resource = ag2_response.results[0].resource_name
        ag2_id = ag2_resource.split("/")[-1]
        print(f"  Ad Group 2 created: {ag2_resource}")
        print(f"  Ad Group 2 ID: {ag2_id}")
    except GoogleAdsException as ex:
        print(f"  ERROR creating ad group 2: {ex}")
        raise

    # Keywords for Leagues & Open Gym
    leagues_keywords = [
        "basketball league fort walton beach",
        "youth basketball league near me",
        "basketball open gym near me",
        "basketball gym near me",
        "open gym basketball",
        "youth basketball near me",
        "basketball gym fort walton beach",
        "indoor basketball gym",
        "basketball league florida",
    ]

    kw_ops_2 = []
    for kw in leagues_keywords:
        op = client.get_type("AdGroupCriterionOperation")
        c = op.create
        c.ad_group = ag2_resource
        c.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
        c.keyword.text = kw
        c.keyword.match_type = KeywordMatchTypeEnum.PHRASE
        kw_ops_2.append(op)

    try:
        ad_group_criterion_service.mutate_ad_group_criteria(
            customer_id=CUSTOMER_ID, operations=kw_ops_2
        )
        print(f"  Added {len(leagues_keywords)} keywords to Leagues & Open Gym")
    except GoogleAdsException as ex:
        print(f"  ERROR adding keywords to ag2: {ex}")

    # RSA Ad for Leagues & Open Gym
    print("  Creating RSA ad for Leagues & Open Gym...")
    leagues_headlines = [
        "Basketball League FWB FL",       # 24 chars
        "Leagues Starting at $59",         # 23 chars
        "Jersey Included Free",            # 20 chars
        "Real Refs & Stat Tracking",       # 25 chars
        "Open Gym Drop-In Welcome",        # 24 chars
        "Ages 5-18 All Divisions",         # 23 chars
        "Saturday Morning Games",          # 22 chars
        "Indoor Basketball Gym",           # 21 chars
        "Full Regulation Court",           # 21 chars
        "Playoff Brackets & Trophies",     # 27 chars — FIXED below
        "Near Destin & Niceville",         # 23 chars
        "Military Discount $20 Off",       # 25 chars
        "Register Online Today",           # 21 chars
        "Fall League Starting Soon",       # 25 chars
        "Dedicated Basketball Gym",        # 24 chars
    ]

    # Fix the one that might be too long
    leagues_headlines[9] = "Playoffs & Trophies"  # 19 chars — safe

    leagues_descriptions = [
        "Youth basketball leagues in Fort Walton Beach. Trained refs, stats & playoffs. From $59.",  # 90 chars
        "Join FCP Sports leagues — jersey included, real competition. Ages 5-18, all skill levels.",  # 90 chars
        "Indoor basketball gym in Fort Walton Beach. Open gym, leagues, training & court rental.",    # 88 chars
        "Military families save $20. Saturday games, weekday open gym. Near Eglin AFB & Destin.",    # 89 chars
    ]

    # Verify char limits
    for i, h in enumerate(leagues_headlines):
        if len(h) > 30:
            print(f"  WARNING: League Headline {i+1} too long ({len(h)} chars): '{h}'")
    for i, d in enumerate(leagues_descriptions):
        if len(d) > 90:
            print(f"  WARNING: League Description {i+1} too long ({len(d)} chars): '{d}'")

    ag2_ad_op = client.get_type("AdGroupAdOperation")
    ag2_ad = ag2_ad_op.create
    ag2_ad.ad_group = ag2_resource
    ag2_ad.status = AdGroupAdStatusEnum.ENABLED

    rsa2 = ag2_ad.ad.responsive_search_ad
    for h in leagues_headlines:
        asset = client.get_type("AdTextAsset")
        asset.text = h
        rsa2.headlines.append(asset)
    for d in leagues_descriptions:
        asset = client.get_type("AdTextAsset")
        asset.text = d
        rsa2.descriptions.append(asset)

    ag2_ad.ad.final_urls.append("https://fcpsports.org/leagues/")

    try:
        ad_group_ad_service.mutate_ad_group_ads(
            customer_id=CUSTOMER_ID, operations=[ag2_ad_op]
        )
        print("  RSA ad created for Leagues & Open Gym")
    except GoogleAdsException as ex:
        print(f"  ERROR creating RSA for ag2: {ex}")

    # ─── Step 6: Campaign Extensions ─────────────────────────────────────────
    print("\n[6] Adding campaign extensions...")

    # --- Sitelinks ---
    print("  Adding sitelinks...")
    sitelinks_data = [
        {
            "link_text": "Summer Camps $149/wk",
            "final_url": "https://fcpsports.org/camps/summer-day-camp/",
            "desc1": "Ages 5-17",
            "desc2": "All skill levels",
        },
        {
            "link_text": "Basketball Leagues $59+",
            "final_url": "https://fcpsports.org/leagues/",
            "desc1": "Jersey included",
            "desc2": "Real refs & stats",
        },
        {
            "link_text": "Open Gym Schedule",
            "final_url": "https://fcpsports.org/services/open-gym/",
            "desc1": "Drop-in welcome",
            "desc2": "Weekdays & weekends",
        },
        {
            "link_text": "Girls-Only Camp",
            "final_url": "https://fcpsports.org/camps/girls-basketball-camp/",
            "desc1": "Dedicated sessions",
            "desc2": "All ages welcome",
        },
    ]

    # Verify sitelink description char limits (max 25 each)
    for sl in sitelinks_data:
        for key in ["desc1", "desc2"]:
            if len(sl[key]) > 25:
                print(f"  WARNING: Sitelink desc too long ({len(sl[key])} chars): '{sl[key]}'")

    sitelink_asset_resources = []
    for sl in sitelinks_data:
        asset_op = client.get_type("AssetOperation")
        asset = asset_op.create
        asset.sitelink_asset.link_text = sl["link_text"]
        asset.sitelink_asset.description1 = sl["desc1"]
        asset.sitelink_asset.description2 = sl["desc2"]
        asset.final_urls.append(sl["final_url"])  # final_urls is on Asset, not SitelinkAsset

        try:
            asset_response = asset_service.mutate_assets(
                customer_id=CUSTOMER_ID, operations=[asset_op]
            )
            sitelink_asset_resources.append(asset_response.results[0].resource_name)
        except GoogleAdsException as ex:
            print(f"    ERROR creating sitelink '{sl['link_text']}': {ex}")

    # Link sitelinks to campaign
    for asset_resource in sitelink_asset_resources:
        ca_op = client.get_type("CampaignAssetOperation")
        ca = ca_op.create
        ca.campaign = campaign_resource
        ca.asset = asset_resource
        ca.field_type = AssetFieldTypeEnum.SITELINK
        try:
            campaign_asset_service.mutate_campaign_assets(
                customer_id=CUSTOMER_ID, operations=[ca_op]
            )
        except GoogleAdsException as ex:
            print(f"    ERROR linking sitelink: {ex}")

    print(f"  Added {len(sitelink_asset_resources)} sitelinks")

    # --- Callouts ---
    print("  Adding callouts...")
    callout_texts = [
        "Military Discounts",
        "Ages 5-17",
        "Dedicated Basketball Gym",
        "Trained Refs",
        "Jersey Included",
        "Near Destin",
    ]

    for text in callout_texts:
        if len(text) > 25:
            print(f"  WARNING: Callout too long ({len(text)} chars): '{text}'")

    callout_resources = []
    for text in callout_texts:
        asset_op = client.get_type("AssetOperation")
        asset = asset_op.create
        asset.callout_asset.callout_text = text

        try:
            asset_response = asset_service.mutate_assets(
                customer_id=CUSTOMER_ID, operations=[asset_op]
            )
            callout_resources.append(asset_response.results[0].resource_name)
        except GoogleAdsException as ex:
            print(f"    ERROR creating callout '{text}': {ex}")

    for asset_resource in callout_resources:
        ca_op = client.get_type("CampaignAssetOperation")
        ca = ca_op.create
        ca.campaign = campaign_resource
        ca.asset = asset_resource
        ca.field_type = AssetFieldTypeEnum.CALLOUT
        try:
            campaign_asset_service.mutate_campaign_assets(
                customer_id=CUSTOMER_ID, operations=[ca_op]
            )
        except GoogleAdsException as ex:
            print(f"    ERROR linking callout: {ex}")

    print(f"  Added {len(callout_resources)} callouts")

    # --- Call Extension ---
    print("  Adding call extension...")
    call_asset_op = client.get_type("AssetOperation")
    call_asset = call_asset_op.create
    call_asset.call_asset.phone_number = PHONE_NUMBER
    call_asset.call_asset.country_code = PHONE_COUNTRY

    try:
        call_response = asset_service.mutate_assets(
            customer_id=CUSTOMER_ID, operations=[call_asset_op]
        )
        call_resource = call_response.results[0].resource_name

        ca_op = client.get_type("CampaignAssetOperation")
        ca = ca_op.create
        ca.campaign = campaign_resource
        ca.asset = call_resource
        ca.field_type = AssetFieldTypeEnum.CALL

        campaign_asset_service.mutate_campaign_assets(
            customer_id=CUSTOMER_ID, operations=[ca_op]
        )
        print(f"  Call extension added: {PHONE_NUMBER}")
    except GoogleAdsException as ex:
        print(f"  ERROR adding call extension: {ex}")

    # ─── Step 7: Conversion Goal Priorities ──────────────────────────────────
    print("\n[7] Setting conversion goal priorities...")
    try:
        # Query all conversion goals for this campaign
        query = f"""
            SELECT
                campaign_conversion_goal.category,
                campaign_conversion_goal.origin,
                campaign_conversion_goal.biddable,
                campaign_conversion_goal.resource_name
            FROM campaign_conversion_goal
            WHERE campaign.id = {campaign_id}
        """
        response = ga_service.search(customer_id=CUSTOMER_ID, query=query)
        rows = list(response)

        if rows:
            # PRIMARY goals: SIGNUP/WEBSITE and PHONE_CALL_LEAD/CALL_FROM_ADS
            primary_combos = [
                (ConversionActionCategoryEnum.SIGNUP, ConversionOriginEnum.WEBSITE),
                (ConversionActionCategoryEnum.PHONE_CALL_LEAD, ConversionOriginEnum.CALL_FROM_ADS),
                (ConversionActionCategoryEnum.CONTACT, ConversionOriginEnum.CALL_FROM_ADS),
            ]

            goal_ops = []
            for row in rows:
                goal = row.campaign_conversion_goal
                is_primary = any(
                    goal.category == cat and goal.origin == orig
                    for cat, orig in primary_combos
                )
                should_be_biddable = is_primary

                if goal.biddable != should_be_biddable:
                    op = client.get_type("CampaignConversionGoalOperation")
                    g = op.update
                    g.resource_name = goal.resource_name
                    g.biddable = should_be_biddable
                    op.update_mask.paths.append("biddable")
                    goal_ops.append(op)

            if goal_ops:
                campaign_conversion_goal_service.mutate_campaign_conversion_goals(
                    customer_id=CUSTOMER_ID, operations=goal_ops
                )
                print(f"  Updated {len(goal_ops)} conversion goal priorities")
            else:
                print("  Conversion goals already set correctly (or no goals to update)")
        else:
            print("  No campaign conversion goals found yet (normal for brand-new campaigns)")

    except GoogleAdsException as ex:
        print(f"  ERROR setting conversion goals: {ex}")
    except Exception as ex:
        print(f"  NOTE: Could not set conversion goals: {ex}")

    # ─── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("CAMPAIGN CREATION COMPLETE")
    print("=" * 60)
    print(f"  Customer ID:     {CUSTOMER_ID}")
    print(f"  Campaign:        {CAMPAIGN_NAME}")
    print(f"  Campaign ID:     {campaign_id}")
    print(f"  Campaign Res:    {campaign_resource}")
    print(f"  Ad Group 1:      Camps & Training (ID: {ag1_id})")
    print(f"  Ad Group 2:      Leagues & Open Gym (ID: {ag2_id})")
    print(f"  Status:          PAUSED — review before enabling")
    print(f"  Budget:          $10/day")
    print(f"  Geo:             30-mile radius, Fort Walton Beach FL")
    print(f"  Bidding:         Maximize Conversions")
    print("")
    print("  NEXT STEPS:")
    print("  1. Review campaign in Google Ads UI")
    print("  2. Verify conversion actions are set up on fcpsports.org")
    print("  3. Enable campaign when ready")
    print("=" * 60)

    return {
        "customer_id": CUSTOMER_ID,
        "campaign_id": campaign_id,
        "campaign_resource": campaign_resource,
        "ag1_id": ag1_id,
        "ag2_id": ag2_id,
    }


if __name__ == "__main__":
    result = run()
