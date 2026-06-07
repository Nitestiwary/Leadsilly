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

// Phone Regex to match standard B2B phones (including spacing like 094148 61076)
const PHONE_REGEX = /(\+?\d{1,4}[\s.-]?)?\(?\d{2,6}\)?[\s.-]?\d{3,6}[\s.-]?\d{3,6}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const clean = (val: string) => {
  const cleanVal = (val || '').trim();
  if (!cleanVal || cleanVal.toLowerCase() === 'undefined' || cleanVal.toLowerCase() === 'search results' || cleanVal.includes('Google Search') || cleanVal === 'N/A') {
    return 'N/A';
  }
  return cleanVal;
};

function extractAddressFromText(text: string): string {
  const addressKeywords = ['street', 'st.', 'avenue', 'ave.', 'road', 'rd.', 'lane', 'ln.', 'suite', 'ste.', 'colony', 'bazar', 'market', 'ward', 'complex', 'nagar', 'gopalganj', 'bihar'];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 150);
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const hasKeyword = addressKeywords.some(keyword => lowerLine.includes(keyword));
    const hasZip = /\b\d{5,6}(-\d{4})?\b/.test(line);
    
    // Ignore review quotes
    if (line.startsWith('"') || line.endsWith('"') || line.includes('“') || line.includes('”')) {
      continue;
    }
    
    if (hasKeyword || hasZip) {
      return line;
    }
  }
  return '';
}

function determineSourceType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('yelp.com') || lowerUrl.includes('yellowpages')) return 'Business Directory';
  if (lowerUrl.includes('linkedin.com') || lowerUrl.includes('facebook.com')) return 'Social Media';
  if (lowerUrl.includes('google.com/search') || lowerUrl.includes('google.co.in/search')) return 'Search Result Page';
  return 'Company Website';
}

function scrapePageData(): ExtractedLead[] {
  const leads: ExtractedLead[] = [];
  const sourceUrl = window.location.href;
  const sourceDomain = window.location.hostname;
  const sourceType = determineSourceType(sourceUrl);

  // A. Google Search / Maps results parsing
  if (sourceDomain.includes('google.com')) {
    const titleEls = Array.from(document.querySelectorAll('div.dbg0pd, .OSrXXb, [data-attrid="title"], a.C7rsq, div[role="heading"] span'));
    const seenNames = new Set<string>();

    titleEls.forEach(titleEl => {
      const bName = titleEl.textContent?.trim() || '';
      if (!bName || bName.length < 3 || bName.length > 100 || bName.toLowerCase().includes('google') || bName.toLowerCase().includes('search') || seenNames.has(bName)) {
        return;
      }
      seenNames.add(bName);

      // Traversal upwards to find the container card representing this entire business block
      let cardContainer: HTMLElement = titleEl as HTMLElement;
      let parent = titleEl.parentElement;
      
      // Go up parent chain, stop if parent contains maps/website links (standard Google local search card element)
      while (parent && parent.tagName !== 'BODY') {
        const hasDetails = parent.querySelector('a[href*="maps"], a[href*="google.com/maps"], a[aria-label*="website"], a[aria-label*="direction"]');
        if (hasDetails) {
          cardContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }

      // 1. Extract Website Link
      let website = 'N/A';
      const links = Array.from(cardContainer.querySelectorAll('a[href]'));
      
      for (const link of links) {
        const text = (link.textContent || '').trim().toLowerCase();
        const aria = (link.getAttribute('aria-label') || '').toLowerCase();
        const href = link.getAttribute('href') || '';
        
        if (href) {
          const isWebsiteBtn = text.includes('website') || aria.includes('website') || aria.includes('visit website') || link.querySelector('.globe, svg, img');
          if (isWebsiteBtn) {
            if (href.includes('google.com/url?')) {
              const urlObj = new URL(href, window.location.href);
              const urlParam = urlObj.searchParams.get('url') || urlObj.searchParams.get('q');
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
      }

      // Fallback: Check for external links inside card container
      if (website === 'N/A') {
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (href && !href.startsWith('/') && !href.startsWith('#') && !href.includes('google.com') && !href.includes('gstatic.com') && !href.includes('maps')) {
            website = href;
            break;
          }
        }
      }

      // 2. Extract Phone & Address
      let phone = 'N/A';
      let address = 'N/A';
      const innerText = cardContainer.innerText || '';
      
      const parts = innerText.split(/·|•|\n/).map(p => p.trim()).filter(Boolean);
      parts.forEach(part => {
        // Ignore review quotes
        if (part.startsWith('"') || part.endsWith('"') || part.includes('“') || part.includes('”') || part.toLowerCase().includes('choching') || part.toLowerCase().includes('coaching') || part.toLowerCase().includes('excellent') || part.toLowerCase().includes('teacher')) {
          return;
        }

        const digits = part.replace(/\D/g, '');
        // Phone match
        if (digits.length >= 8 && digits.length <= 15 && (part.startsWith('0') || part.startsWith('+') || part.startsWith('9') || part.startsWith('7') || part.startsWith('8'))) {
          phone = part;
        } else if (part.toLowerCase().includes('closed') || part.toLowerCase().includes('open') || part.includes('★') || part.includes('reviews') || part.includes('star')) {
          // Skip ratings/hours
        } else if (part.length > 5 && (part.includes(',') || part.includes('Road') || part.includes('Rd') || part.includes('Bihar') || part.includes('Colony'))) {
          address = part;
        }
      });

      // Fallback regex for phone number search
      if (phone === 'N/A') {
        const matches = innerText.match(PHONE_REGEX);
        if (matches) {
          const cleanPhones = matches.filter(p => {
            const digits = p.replace(/\D/g, '');
            return digits.length >= 8 && digits.length <= 15;
          });
          if (cleanPhones.length > 0) {
            phone = cleanPhones[0];
          }
        }
      }

      // Fallback address parsing
      if (address === 'N/A') {
        address = extractAddressFromText(innerText) || 'N/A';
      }

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

  // B. Fallback: Standard landing page scraping
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
    let website = window.location.origin;

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
        phone = cleanPhones[0];
      }
    }

    leads.push({
      name: clean(name),
      businessName: clean(businessName),
      email: clean(email),
      phone: clean(phone),
      website: clean(website),
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extract_leads') {
    const extractedData = scrapePageData();
    sendResponse({ success: true, data: extractedData });
  }
  return true;
});
