// Content Script: Leadsilly Lead Extractor Scraping Engine

interface ExtractedLead {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  linkedinUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceType: string;
}

// Regular Expressions for matches
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,4}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;

// Helper to standardise empty/meta fields to N/A
const clean = (val: string) => {
  const cleanVal = (val || '').trim();
  if (!cleanVal || cleanVal.toLowerCase() === 'undefined' || cleanVal.toLowerCase() === 'search results' || cleanVal.includes('Google Search') || cleanVal === 'N/A') {
    return 'N/A';
  }
  return cleanVal;
};

// Basic text heuristic for address extraction
function extractAddressFromText(text: string): string {
  const addressKeywords = ['street', 'st.', 'avenue', 'ave.', 'road', 'rd.', 'lane', 'ln.', 'suite', 'ste.', 'colony', 'bazar', 'market', 'ward'];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 8 && l.length < 150);
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const hasKeyword = addressKeywords.some(keyword => lowerLine.includes(keyword));
    const hasZip = /\b\d{5,6}(-\d{4})?\b/.test(line); // Zip patterns (US 5-digit, India 6-digit)
    
    if (hasKeyword || hasZip) {
      return line;
    }
  }
  return '';
}

// Determine page category
function determineSourceType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('yelp.com') || lowerUrl.includes('yellowpages') || lowerUrl.includes('tripadvisor')) {
    return 'Business Directory';
  }
  if (lowerUrl.includes('linkedin.com') || lowerUrl.includes('facebook.com') || lowerUrl.includes('twitter.com')) {
    return 'Social Media Profile';
  }
  if (lowerUrl.includes('google.com/search') || lowerUrl.includes('google.co.in/search')) {
    return 'Search Result Page';
  }
  return 'Company Website';
}

function scrapePageData(): ExtractedLead[] {
  const leads: ExtractedLead[] = [];
  const sourceUrl = window.location.href;
  const sourceDomain = window.location.hostname;
  const sourceType = determineSourceType(sourceUrl);

  // A. Try to extract list items from Google Search results
  if (sourceDomain.includes('google.com')) {
    // Select Google search listing blocks (cards)
    const cards = Array.from(document.querySelectorAll('div.VkCb9c, div.uV35jd, div.dbg0pd, div.g, .OSrXXb, .C7rsq'));
    const seenNames = new Set<string>();

    cards.forEach(card => {
      // Find business title
      let bName = '';
      const titleEl = card.querySelector('[data-attrid="title"], div[role="heading"], .OSrXXb, a.C7rsq, span');
      
      if (titleEl) {
        bName = titleEl.textContent?.trim() || '';
      } else if (card.tagName === 'A' || card.classList.contains('OSrXXb')) {
        bName = card.textContent?.trim() || '';
      }

      // Filter out invalid business titles
      if (!bName || bName.length < 3 || bName.length > 100 || bName.toLowerCase().includes('google') || bName.toLowerCase().includes('search') || seenNames.has(bName)) {
        return;
      }
      seenNames.add(bName);

      // Find website URL from a elements inside card or adjacent elements
      let website = 'N/A';
      const cardParent = card.closest('div') || card;
      const cardLinks = Array.from(cardParent.querySelectorAll('a[href]'));
      
      for (const link of cardLinks) {
        const text = (link.textContent || '').trim().toLowerCase();
        const aria = (link.getAttribute('aria-label') || '').toLowerCase();
        const href = link.getAttribute('href') || '';
        
        if (href && (text === 'website' || aria.includes('website') || aria.includes('visit website') || link.querySelector('.globe, svg, img'))) {
          if (href.includes('google.com/url?')) {
            const urlParam = new URL(href, window.location.href).searchParams.get('url');
            if (urlParam) {
              website = urlParam;
              break;
            }
          } else if (!href.startsWith('/') && !href.includes('google.com')) {
            website = href;
            break;
          }
        }
      }

      // Check standard links if still N/A
      if (website === 'N/A') {
        for (const link of cardLinks) {
          const href = link.getAttribute('href') || '';
          if (href && !href.startsWith('/') && !href.startsWith('#') && !href.includes('google.com') && !href.includes('gstatic.com') && !href.includes('youtube.com')) {
            website = href;
            break;
          }
        }
      }

      // Find Phone
      let phone = 'N/A';
      const textContent = cardParent.textContent || '';
      const matchedPhones = textContent.match(PHONE_REGEX);
      if (matchedPhones && matchedPhones.length > 0) {
        const cleanPhones = matchedPhones.filter(p => p.replace(/\D/g, '').length >= 8);
        if (cleanPhones.length > 0) {
          phone = cleanPhones[0].trim();
        }
      }

      // Find Address
      const address = extractAddressFromText(textContent) || 'N/A';

      leads.push({
        name: 'N/A',
        businessName: clean(bName),
        email: 'N/A',
        phone: clean(phone),
        website: clean(website),
        address: clean(address),
        linkedinUrl: 'N/A',
        facebookUrl: 'N/A',
        instagramUrl: 'N/A',
        twitterUrl: 'N/A',
        sourceUrl,
        sourceDomain,
        sourceType
      });
    });
  }

  // B. Fallback: If no cards are found, or we are on a standard single-business page
  if (leads.length === 0) {
    let name = '';
    let businessName = '';
    let email = '';
    let phone = '';
    let address = '';
    let linkedinUrl = '';
    let facebookUrl = '';
    let instagramUrl = '';
    let twitterUrl = '';
    let foundWebsite = 'N/A';

    // Parse JSON-LD scripts
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent || '{}');
        const inspectSchema = (obj: any) => {
          if (!obj) return;
          if (obj['@type'] === 'LocalBusiness' || obj['@type'] === 'Organization') {
            businessName = obj.name || businessName;
            phone = obj.telephone || phone;
            email = obj.email || email;
            if (obj.address) {
              address = typeof obj.address === 'string' 
                ? obj.address 
                : `${obj.address.streetAddress || ''}, ${obj.address.addressLocality || ''}, ${obj.address.addressRegion || ''} ${obj.address.postalCode || ''}`;
            }
          }
          if (obj['@type'] === 'Person') {
            name = obj.name || name;
            email = obj.email || email;
          }
          if (Array.isArray(obj)) {
            obj.forEach(inspectSchema);
          } else if (typeof obj === 'object') {
            Object.values(obj).forEach(val => {
              if (typeof val === 'object') inspectSchema(val);
            });
          }
        };
        inspectSchema(data);
      } catch (e) {}
    });

    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    
    if (!businessName) businessName = ogSiteName || ogTitle || document.title || '';
    if (!name) {
      const h1 = document.querySelector('h1')?.textContent?.trim();
      if (h1 && h1.length < 50) name = h1;
    }

    const links = Array.from(document.querySelectorAll('a[href]'));
    links.forEach((link: any) => {
      const href = link.href.toLowerCase();
      if (href.includes('linkedin.com/in/') || href.includes('linkedin.com/company/')) {
        linkedinUrl = link.href;
      } else if (href.includes('facebook.com/') && !href.includes('sharer')) {
        facebookUrl = link.href;
      } else if (href.includes('instagram.com/')) {
        instagramUrl = link.href;
      } else if (href.includes('twitter.com/') || href.includes('x.com/')) {
        twitterUrl = link.href;
      }
    });

    const textContent = document.body.innerText;
    const matchedEmails = textContent.match(EMAIL_REGEX);
    if (matchedEmails && matchedEmails.length > 0) {
      email = matchedEmails[0];
    }

    const matchedPhones = textContent.match(PHONE_REGEX);
    if (matchedPhones && matchedPhones.length > 0) {
      const cleanPhones = matchedPhones.filter(p => p.replace(/\D/g, '').length >= 8);
      if (cleanPhones.length > 0) {
        phone = cleanPhones[0].trim();
      }
    }

    foundWebsite = window.location.origin;

    leads.push({
      name: clean(name),
      businessName: clean(businessName),
      email: clean(email),
      phone: clean(phone),
      website: clean(foundWebsite),
      address: clean(address || extractAddressFromText(textContent)),
      linkedinUrl: clean(linkedinUrl),
      facebookUrl: clean(facebookUrl),
      instagramUrl: clean(instagramUrl),
      twitterUrl: clean(twitterUrl),
      sourceUrl,
      sourceDomain,
      sourceType
    });
  }

  return leads;
}

// Listener to communicate with Extension background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extract_leads') {
    const extractedData = scrapePageData();
    sendResponse({ success: true, data: extractedData });
  }
  return true;
});
