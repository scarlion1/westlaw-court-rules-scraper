export interface RuleSetItem {
  title: string;
  guid: string;
  url: string;
  type: 'category' | 'document';
}

export interface ScrapedDocument {
  guid: string;
  title: string;
  url: string;
  citation?: string;
  codeSetName?: string;
  titleDescription?: string;
  currentness?: string;
  content: string;
  rawHtml: string;
  scrapedAt: string;
}

export interface ScrapedRuleSet {
  title: string;
  guid: string;
  url: string;
  scrapedAt: string;
  structure: RuleSetNode[];
  documents: ScrapedDocument[];
  metadata: {
    totalDocuments: number;
    totalCategories: number;
  };
}

export interface RuleSetNode {
  title: string;
  guid: string;
  url: string;
  type: 'category' | 'document';
  children?: RuleSetNode[];
}
