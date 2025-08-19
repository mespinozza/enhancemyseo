export interface City {
  name: string;
  slug: string;
}

export interface State {
  name: string;
  slug: string;
  cities: City[];
}

export interface LocationData {
  states: State[];
}

export const locationData: LocationData = {
  "states": [
    {
      "name": "Alabama",
      "slug": "alabama",
      "cities": [
        { "name": "Birmingham", "slug": "birmingham" },
        { "name": "Montgomery", "slug": "montgomery" },
        { "name": "Huntsville", "slug": "huntsville" },
        { "name": "Mobile", "slug": "mobile" },
        { "name": "Tuscaloosa", "slug": "tuscaloosa" }
      ]
    },
    {
      "name": "Alaska",
      "slug": "alaska",
      "cities": [
        { "name": "Anchorage", "slug": "anchorage" },
        { "name": "Fairbanks", "slug": "fairbanks" },
        { "name": "Juneau", "slug": "juneau" }
      ]
    },
    {
      "name": "Arizona",
      "slug": "arizona",
      "cities": [
        { "name": "Phoenix", "slug": "phoenix" },
        { "name": "Tucson", "slug": "tucson" },
        { "name": "Mesa", "slug": "mesa" },
        { "name": "Chandler", "slug": "chandler" },
        { "name": "Scottsdale", "slug": "scottsdale" },
        { "name": "Glendale", "slug": "glendale" },
        { "name": "Tempe", "slug": "tempe" }
      ]
    },
    {
      "name": "Arkansas",
      "slug": "arkansas",
      "cities": [
        { "name": "Little Rock", "slug": "little-rock" },
        { "name": "Fort Smith", "slug": "fort-smith" },
        { "name": "Fayetteville", "slug": "fayetteville" },
        { "name": "Springdale", "slug": "springdale" }
      ]
    },
    {
      "name": "California",
      "slug": "california",
      "cities": [
        { "name": "Los Angeles", "slug": "los-angeles" },
        { "name": "San Diego", "slug": "san-diego" },
        { "name": "San Jose", "slug": "san-jose" },
        { "name": "San Francisco", "slug": "san-francisco" },
        { "name": "Fresno", "slug": "fresno" },
        { "name": "Sacramento", "slug": "sacramento" },
        { "name": "Long Beach", "slug": "long-beach" },
        { "name": "Oakland", "slug": "oakland" },
        { "name": "Bakersfield", "slug": "bakersfield" },
        { "name": "Anaheim", "slug": "anaheim" },
        { "name": "Santa Ana", "slug": "santa-ana" },
        { "name": "Riverside", "slug": "riverside" },
        { "name": "Stockton", "slug": "stockton" },
        { "name": "Irvine", "slug": "irvine" }
      ]
    },
    {
      "name": "Colorado",
      "slug": "colorado",
      "cities": [
        { "name": "Denver", "slug": "denver" },
        { "name": "Colorado Springs", "slug": "colorado-springs" },
        { "name": "Aurora", "slug": "aurora" },
        { "name": "Fort Collins", "slug": "fort-collins" },
        { "name": "Lakewood", "slug": "lakewood" },
        { "name": "Thornton", "slug": "thornton" }
      ]
    },
    {
      "name": "Connecticut",
      "slug": "connecticut",
      "cities": [
        { "name": "Bridgeport", "slug": "bridgeport" },
        { "name": "New Haven", "slug": "new-haven" },
        { "name": "Hartford", "slug": "hartford" },
        { "name": "Stamford", "slug": "stamford" },
        { "name": "Waterbury", "slug": "waterbury" }
      ]
    },
    {
      "name": "Delaware",
      "slug": "delaware",
      "cities": [
        { "name": "Wilmington", "slug": "wilmington" },
        { "name": "Dover", "slug": "dover" },
        { "name": "Newark", "slug": "newark" }
      ]
    },
    {
      "name": "Florida",
      "slug": "florida",
      "cities": [
        { "name": "Jacksonville", "slug": "jacksonville" },
        { "name": "Miami", "slug": "miami" },
        { "name": "Tampa", "slug": "tampa" },
        { "name": "Orlando", "slug": "orlando" },
        { "name": "St. Petersburg", "slug": "st-petersburg" },
        { "name": "Hialeah", "slug": "hialeah" },
        { "name": "Tallahassee", "slug": "tallahassee" },
        { "name": "Fort Lauderdale", "slug": "fort-lauderdale" },
        { "name": "Port St. Lucie", "slug": "port-st-lucie" },
        { "name": "Cape Coral", "slug": "cape-coral" }
      ]
    },
    {
      "name": "Georgia",
      "slug": "georgia",
      "cities": [
        { "name": "Atlanta", "slug": "atlanta" },
        { "name": "Columbus", "slug": "columbus" },
        { "name": "Augusta", "slug": "augusta" },
        { "name": "Savannah", "slug": "savannah" },
        { "name": "Athens", "slug": "athens" },
        { "name": "Sandy Springs", "slug": "sandy-springs" }
      ]
    },
    {
      "name": "Hawaii",
      "slug": "hawaii",
      "cities": [
        { "name": "Honolulu", "slug": "honolulu" },
        { "name": "Pearl City", "slug": "pearl-city" },
        { "name": "Hilo", "slug": "hilo" }
      ]
    },
    {
      "name": "Idaho",
      "slug": "idaho",
      "cities": [
        { "name": "Boise", "slug": "boise" },
        { "name": "Meridian", "slug": "meridian" },
        { "name": "Nampa", "slug": "nampa" },
        { "name": "Idaho Falls", "slug": "idaho-falls" }
      ]
    },
    {
      "name": "Illinois",
      "slug": "illinois",
      "cities": [
        { "name": "Chicago", "slug": "chicago" },
        { "name": "Aurora", "slug": "aurora" },
        { "name": "Rockford", "slug": "rockford" },
        { "name": "Joliet", "slug": "joliet" },
        { "name": "Naperville", "slug": "naperville" },
        { "name": "Springfield", "slug": "springfield" },
        { "name": "Peoria", "slug": "peoria" }
      ]
    },
    {
      "name": "Indiana",
      "slug": "indiana",
      "cities": [
        { "name": "Indianapolis", "slug": "indianapolis" },
        { "name": "Fort Wayne", "slug": "fort-wayne" },
        { "name": "Evansville", "slug": "evansville" },
        { "name": "South Bend", "slug": "south-bend" },
        { "name": "Carmel", "slug": "carmel" }
      ]
    },
    {
      "name": "Iowa",
      "slug": "iowa",
      "cities": [
        { "name": "Des Moines", "slug": "des-moines" },
        { "name": "Cedar Rapids", "slug": "cedar-rapids" },
        { "name": "Davenport", "slug": "davenport" },
        { "name": "Sioux City", "slug": "sioux-city" }
      ]
    },
    {
      "name": "Kansas",
      "slug": "kansas",
      "cities": [
        { "name": "Wichita", "slug": "wichita" },
        { "name": "Overland Park", "slug": "overland-park" },
        { "name": "Kansas City", "slug": "kansas-city" },
        { "name": "Topeka", "slug": "topeka" },
        { "name": "Olathe", "slug": "olathe" }
      ]
    },
    {
      "name": "Kentucky",
      "slug": "kentucky",
      "cities": [
        { "name": "Louisville", "slug": "louisville" },
        { "name": "Lexington", "slug": "lexington" },
        { "name": "Bowling Green", "slug": "bowling-green" },
        { "name": "Owensboro", "slug": "owensboro" }
      ]
    },
    {
      "name": "Louisiana",
      "slug": "louisiana",
      "cities": [
        { "name": "New Orleans", "slug": "new-orleans" },
        { "name": "Baton Rouge", "slug": "baton-rouge" },
        { "name": "Shreveport", "slug": "shreveport" },
        { "name": "Lafayette", "slug": "lafayette" }
      ]
    },
    {
      "name": "Maine",
      "slug": "maine",
      "cities": [
        { "name": "Portland", "slug": "portland" },
        { "name": "Lewiston", "slug": "lewiston" },
        { "name": "Bangor", "slug": "bangor" }
      ]
    },
    {
      "name": "Maryland",
      "slug": "maryland",
      "cities": [
        { "name": "Baltimore", "slug": "baltimore" },
        { "name": "Frederick", "slug": "frederick" },
        { "name": "Rockville", "slug": "rockville" },
        { "name": "Gaithersburg", "slug": "gaithersburg" },
        { "name": "Bowie", "slug": "bowie" }
      ]
    },
    {
      "name": "Massachusetts",
      "slug": "massachusetts",
      "cities": [
        { "name": "Boston", "slug": "boston" },
        { "name": "Worcester", "slug": "worcester" },
        { "name": "Springfield", "slug": "springfield" },
        { "name": "Lowell", "slug": "lowell" },
        { "name": "Cambridge", "slug": "cambridge" },
        { "name": "New Bedford", "slug": "new-bedford" }
      ]
    },
    {
      "name": "Michigan",
      "slug": "michigan",
      "cities": [
        { "name": "Detroit", "slug": "detroit" },
        { "name": "Grand Rapids", "slug": "grand-rapids" },
        { "name": "Warren", "slug": "warren" },
        { "name": "Sterling Heights", "slug": "sterling-heights" },
        { "name": "Ann Arbor", "slug": "ann-arbor" },
        { "name": "Lansing", "slug": "lansing" }
      ]
    },
    {
      "name": "Minnesota",
      "slug": "minnesota",
      "cities": [
        { "name": "Minneapolis", "slug": "minneapolis" },
        { "name": "Saint Paul", "slug": "saint-paul" },
        { "name": "Rochester", "slug": "rochester" },
        { "name": "Duluth", "slug": "duluth" },
        { "name": "Bloomington", "slug": "bloomington" }
      ]
    },
    {
      "name": "Mississippi",
      "slug": "mississippi",
      "cities": [
        { "name": "Jackson", "slug": "jackson" },
        { "name": "Gulfport", "slug": "gulfport" },
        { "name": "Southaven", "slug": "southaven" },
        { "name": "Hattiesburg", "slug": "hattiesburg" }
      ]
    },
    {
      "name": "Missouri",
      "slug": "missouri",
      "cities": [
        { "name": "Kansas City", "slug": "kansas-city" },
        { "name": "St. Louis", "slug": "st-louis" },
        { "name": "Springfield", "slug": "springfield" },
        { "name": "Columbia", "slug": "columbia" },
        { "name": "Independence", "slug": "independence" }
      ]
    },
    {
      "name": "Montana",
      "slug": "montana",
      "cities": [
        { "name": "Billings", "slug": "billings" },
        { "name": "Missoula", "slug": "missoula" },
        { "name": "Great Falls", "slug": "great-falls" },
        { "name": "Bozeman", "slug": "bozeman" }
      ]
    },
    {
      "name": "Nebraska",
      "slug": "nebraska",
      "cities": [
        { "name": "Omaha", "slug": "omaha" },
        { "name": "Lincoln", "slug": "lincoln" },
        { "name": "Bellevue", "slug": "bellevue" },
        { "name": "Grand Island", "slug": "grand-island" }
      ]
    },
    {
      "name": "Nevada",
      "slug": "nevada",
      "cities": [
        { "name": "Las Vegas", "slug": "las-vegas" },
        { "name": "Henderson", "slug": "henderson" },
        { "name": "Reno", "slug": "reno" },
        { "name": "North Las Vegas", "slug": "north-las-vegas" }
      ]
    },
    {
      "name": "New Hampshire",
      "slug": "new-hampshire",
      "cities": [
        { "name": "Manchester", "slug": "manchester" },
        { "name": "Nashua", "slug": "nashua" },
        { "name": "Concord", "slug": "concord" }
      ]
    },
    {
      "name": "New Jersey",
      "slug": "new-jersey",
      "cities": [
        { "name": "Newark", "slug": "newark" },
        { "name": "Jersey City", "slug": "jersey-city" },
        { "name": "Paterson", "slug": "paterson" },
        { "name": "Elizabeth", "slug": "elizabeth" },
        { "name": "Edison", "slug": "edison" },
        { "name": "Woodbridge", "slug": "woodbridge" },
        { "name": "Lakewood", "slug": "lakewood" }
      ]
    },
    {
      "name": "New Mexico",
      "slug": "new-mexico",
      "cities": [
        { "name": "Albuquerque", "slug": "albuquerque" },
        { "name": "Las Cruces", "slug": "las-cruces" },
        { "name": "Rio Rancho", "slug": "rio-rancho" },
        { "name": "Santa Fe", "slug": "santa-fe" }
      ]
    },
    {
      "name": "New York",
      "slug": "new-york",
      "cities": [
        { "name": "New York City", "slug": "new-york-city" },
        { "name": "Buffalo", "slug": "buffalo" },
        { "name": "Rochester", "slug": "rochester" },
        { "name": "Yonkers", "slug": "yonkers" },
        { "name": "Syracuse", "slug": "syracuse" },
        { "name": "Albany", "slug": "albany" },
        { "name": "New Rochelle", "slug": "new-rochelle" }
      ]
    },
    {
      "name": "North Carolina",
      "slug": "north-carolina",
      "cities": [
        { "name": "Charlotte", "slug": "charlotte" },
        { "name": "Raleigh", "slug": "raleigh" },
        { "name": "Greensboro", "slug": "greensboro" },
        { "name": "Durham", "slug": "durham" },
        { "name": "Winston-Salem", "slug": "winston-salem" },
        { "name": "Fayetteville", "slug": "fayetteville" },
        { "name": "Cary", "slug": "cary" }
      ]
    },
    {
      "name": "North Dakota",
      "slug": "north-dakota",
      "cities": [
        { "name": "Fargo", "slug": "fargo" },
        { "name": "Bismarck", "slug": "bismarck" },
        { "name": "Grand Forks", "slug": "grand-forks" }
      ]
    },
    {
      "name": "Ohio",
      "slug": "ohio",
      "cities": [
        { "name": "Columbus", "slug": "columbus" },
        { "name": "Cleveland", "slug": "cleveland" },
        { "name": "Cincinnati", "slug": "cincinnati" },
        { "name": "Toledo", "slug": "toledo" },
        { "name": "Akron", "slug": "akron" },
        { "name": "Dayton", "slug": "dayton" }
      ]
    },
    {
      "name": "Oklahoma",
      "slug": "oklahoma",
      "cities": [
        { "name": "Oklahoma City", "slug": "oklahoma-city" },
        { "name": "Tulsa", "slug": "tulsa" },
        { "name": "Norman", "slug": "norman" },
        { "name": "Broken Arrow", "slug": "broken-arrow" }
      ]
    },
    {
      "name": "Oregon",
      "slug": "oregon",
      "cities": [
        { "name": "Portland", "slug": "portland" },
        { "name": "Eugene", "slug": "eugene" },
        { "name": "Salem", "slug": "salem" },
        { "name": "Gresham", "slug": "gresham" }
      ]
    },
    {
      "name": "Pennsylvania",
      "slug": "pennsylvania",
      "cities": [
        { "name": "Philadelphia", "slug": "philadelphia" },
        { "name": "Pittsburgh", "slug": "pittsburgh" },
        { "name": "Allentown", "slug": "allentown" },
        { "name": "Erie", "slug": "erie" },
        { "name": "Reading", "slug": "reading" },
        { "name": "Scranton", "slug": "scranton" }
      ]
    },
    {
      "name": "Rhode Island",
      "slug": "rhode-island",
      "cities": [
        { "name": "Providence", "slug": "providence" },
        { "name": "Warwick", "slug": "warwick" },
        { "name": "Cranston", "slug": "cranston" }
      ]
    },
    {
      "name": "South Carolina",
      "slug": "south-carolina",
      "cities": [
        { "name": "Charleston", "slug": "charleston" },
        { "name": "Columbia", "slug": "columbia" },
        { "name": "North Charleston", "slug": "north-charleston" },
        { "name": "Mount Pleasant", "slug": "mount-pleasant" }
      ]
    },
    {
      "name": "South Dakota",
      "slug": "south-dakota",
      "cities": [
        { "name": "Sioux Falls", "slug": "sioux-falls" },
        { "name": "Rapid City", "slug": "rapid-city" },
        { "name": "Aberdeen", "slug": "aberdeen" }
      ]
    },
    {
      "name": "Tennessee",
      "slug": "tennessee",
      "cities": [
        { "name": "Nashville", "slug": "nashville" },
        { "name": "Memphis", "slug": "memphis" },
        { "name": "Knoxville", "slug": "knoxville" },
        { "name": "Chattanooga", "slug": "chattanooga" },
        { "name": "Clarksville", "slug": "clarksville" }
      ]
    },
    {
      "name": "Texas",
      "slug": "texas",
      "cities": [
        { "name": "Houston", "slug": "houston" },
        { "name": "San Antonio", "slug": "san-antonio" },
        { "name": "Dallas", "slug": "dallas" },
        { "name": "Austin", "slug": "austin" },
        { "name": "Fort Worth", "slug": "fort-worth" },
        { "name": "El Paso", "slug": "el-paso" },
        { "name": "Arlington", "slug": "arlington" },
        { "name": "Corpus Christi", "slug": "corpus-christi" },
        { "name": "Plano", "slug": "plano" },
        { "name": "Lubbock", "slug": "lubbock" }
      ]
    },
    {
      "name": "Utah",
      "slug": "utah",
      "cities": [
        { "name": "Salt Lake City", "slug": "salt-lake-city" },
        { "name": "West Valley City", "slug": "west-valley-city" },
        { "name": "Provo", "slug": "provo" },
        { "name": "West Jordan", "slug": "west-jordan" }
      ]
    },
    {
      "name": "Vermont",
      "slug": "vermont",
      "cities": [
        { "name": "Burlington", "slug": "burlington" },
        { "name": "Essex", "slug": "essex" },
        { "name": "South Burlington", "slug": "south-burlington" }
      ]
    },
    {
      "name": "Virginia",
      "slug": "virginia",
      "cities": [
        { "name": "Virginia Beach", "slug": "virginia-beach" },
        { "name": "Norfolk", "slug": "norfolk" },
        { "name": "Chesapeake", "slug": "chesapeake" },
        { "name": "Richmond", "slug": "richmond" },
        { "name": "Newport News", "slug": "newport-news" },
        { "name": "Alexandria", "slug": "alexandria" }
      ]
    },
    {
      "name": "Washington",
      "slug": "washington",
      "cities": [
        { "name": "Seattle", "slug": "seattle" },
        { "name": "Spokane", "slug": "spokane" },
        { "name": "Tacoma", "slug": "tacoma" },
        { "name": "Vancouver", "slug": "vancouver" },
        { "name": "Bellevue", "slug": "bellevue" }
      ]
    },
    {
      "name": "West Virginia",
      "slug": "west-virginia",
      "cities": [
        { "name": "Charleston", "slug": "charleston" },
        { "name": "Huntington", "slug": "huntington" },
        { "name": "Morgantown", "slug": "morgantown" }
      ]
    },
    {
      "name": "Wisconsin",
      "slug": "wisconsin",
      "cities": [
        { "name": "Milwaukee", "slug": "milwaukee" },
        { "name": "Madison", "slug": "madison" },
        { "name": "Green Bay", "slug": "green-bay" },
        { "name": "Kenosha", "slug": "kenosha" }
      ]
    },
    {
      "name": "Wyoming",
      "slug": "wyoming",
      "cities": [
        { "name": "Cheyenne", "slug": "cheyenne" },
        { "name": "Casper", "slug": "casper" },
        { "name": "Laramie", "slug": "laramie" }
      ]
    }
  ]
};

// Utility functions for location handling
export const getStateBySlug = (slug: string): State | undefined => {
  return locationData.states.find(state => state.slug === slug);
};

export const getCityBySlug = (stateSlug: string, citySlug: string): City | undefined => {
  const state = getStateBySlug(stateSlug);
  return state?.cities.find(city => city.slug === citySlug);
};

export const getAllStates = (): State[] => {
  return locationData.states;
};

export const getAllCitiesForState = (stateSlug: string): City[] => {
  const state = getStateBySlug(stateSlug);
  return state?.cities || [];
};
