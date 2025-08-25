import { 
  normalizeMarkdownBullets, 
  normalizeMarkdown, 
  needsNormalization,
  normalizeDealPointsContent,
  type NormalizationResult 
} from '../markdown-normalizer'

describe('normalizeMarkdownBullets', () => {
  describe('Unicode bullet conversion', () => {
    it('should convert Unicode bullets to markdown hyphens', () => {
      const input = `## Key Deal Points

• Location: 1333 North Milwaukee Street
• Total units: 197 Class A urban apartments
• Investment sought: $26,129,566`

      const expected = `## Key Deal Points

- Location: 1333 North Milwaukee Street
- Total units: 197 Class A urban apartments
- Investment sought: $26,129,566`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
      expect(result.changesCount).toBe(3)
      expect(result.patterns).toContain('unicode_bullets')
    })

    it('should handle various Unicode bullet types', () => {
      const input = `• Standard bullet
● Bold bullet
▪ Square bullet
▫ White square bullet  
◦ White bullet
‣ Triangle bullet
⁃ Hyphen bullet`

      const expected = `- Standard bullet
- Bold bullet
- Square bullet
- White square bullet  
- White bullet
- Triangle bullet
- Hyphen bullet`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
      expect(result.changesCount).toBe(7)
    })

    it('should preserve indentation with Unicode bullets', () => {
      const input = `  • Indented bullet
    • Double indented bullet
• Not indented`

      const expected = `  - Indented bullet
    - Double indented bullet
- Not indented`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
    })
  })

  describe('Code block preservation', () => {
    it('should preserve Unicode bullets in code blocks', () => {
      const input = `Here's some markdown:
\`\`\`markdown
• This should not change
● Neither should this
\`\`\`

But this should:
• Convert this bullet`

      const expected = `Here's some markdown:
\`\`\`markdown
• This should not change
● Neither should this
\`\`\`

But this should:
- Convert this bullet`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
      expect(result.changesCount).toBe(1)
    })

    it('should preserve Unicode bullets in inline code and mid-line', () => {
      const input = `Use \`• bullet\` syntax or • regular bullet`

      const expected = `Use \`• bullet\` syntax or • regular bullet`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(false)
      expect(result.changesCount).toBe(0)
    })

    it('should handle multiple code blocks correctly', () => {
      const input = `\`\`\`
• Code bullet 1
\`\`\`

• Text bullet

\`\`\`js
• Code bullet 2
\`\`\`

• Another text bullet`

      const expected = `\`\`\`
• Code bullet 1
\`\`\`

- Text bullet

\`\`\`js
• Code bullet 2
\`\`\`

- Another text bullet`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.changesCount).toBe(2)
    })
  })

  describe('Header spacing', () => {
    it('should add blank lines after headers when missing', () => {
      const input = `## Key Deal Points
• Location: Test
### Financial Performance  
• NOI: $100k`

      const expected = `## Key Deal Points

- Location: Test
### Financial Performance  

- NOI: $100k`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
      expect(result.patterns).toContain('header_spacing')
      expect(result.patterns).toContain('unicode_bullets')
    })

    it('should preserve existing header spacing', () => {
      const input = `## Key Deal Points

• Location: Test

### Financial Performance

• NOI: $100k`

      const expected = `## Key Deal Points

- Location: Test

### Financial Performance

- NOI: $100k`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.patterns).not.toContain('header_spacing')
    })

    it('should handle headers at end of content', () => {
      const input = `## Final Header`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe('## Final Header')
      expect(result.wasNormalized).toBe(false)
    })
  })

  describe('Multiple dashes normalization', () => {
    it('should normalize multiple dashes to single dash', () => {
      const input = `-- Double dash bullet
--- Triple dash bullet
—— Em dash bullet`

      const expected = `- Double dash bullet
- Triple dash bullet
- Em dash bullet`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
      expect(result.patterns).toContain('multiple_dashes')
    })
  })

  describe('Ordered list spacing', () => {
    it('should normalize ordered list spacing', () => {
      const input = `1.  Double space
2.   Triple space
3. Correct space`

      const expected = `1. Double space
2. Triple space
3. Correct space`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
      expect(result.patterns).toContain('ordered_list_spacing')
    })

    it('should handle parentheses in ordered lists', () => {
      const input = `1)  First item
2)   Second item`

      const expected = `1. First item
2. Second item`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty content', () => {
      const result = normalizeMarkdownBullets('')
      
      expect(result.content).toBe('')
      expect(result.wasNormalized).toBe(false)
      expect(result.changesCount).toBe(0)
    })

    it('should handle null/undefined content', () => {
      const result1 = normalizeMarkdownBullets(null as any)
      const result2 = normalizeMarkdownBullets(undefined as any)
      
      expect(result1.content).toBe('')
      expect(result2.content).toBe('')
      expect(result1.wasNormalized).toBe(false)
      expect(result2.wasNormalized).toBe(false)
    })

    it('should handle content with no bullets', () => {
      const input = `This is regular text.
      
With some paragraphs.

## And headers

But no bullets to normalize.`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(`This is regular text.
      
With some paragraphs.

## And headers

But no bullets to normalize.`)
      expect(result.wasNormalized).toBe(false)
      expect(result.changesCount).toBe(0)
    })

    it('should handle mixed content correctly', () => {
      const input = `# Main Title
Here's a list:
• First item with Unicode
- Second item already correct  
• Third item with Unicode

\`\`\`
• Code bullet (preserve)
\`\`\`

## Subsection
Regular text here.`

      const expected = `# Main Title

Here's a list:
- First item with Unicode
- Second item already correct  
- Third item with Unicode

\`\`\`
• Code bullet (preserve)
\`\`\`

## Subsection

Regular text here.`

      const result = normalizeMarkdownBullets(input)
      
      expect(result.content).toBe(expected)
      expect(result.wasNormalized).toBe(true)
      expect(result.patterns).toContain('unicode_bullets')
      expect(result.patterns).toContain('header_spacing')
    })
  })
})

describe('normalizeMarkdown', () => {
  it('should return just the normalized content', () => {
    const input = '• Test bullet'
    const result = normalizeMarkdown(input)
    
    expect(result).toBe('- Test bullet')
    expect(typeof result).toBe('string')
  })
})

describe('needsNormalization', () => {
  it('should detect Unicode bullets', () => {
    expect(needsNormalization('• Test')).toBe(true)
    expect(needsNormalization('● Test')).toBe(true)
    expect(needsNormalization('- Test')).toBe(false)
    expect(needsNormalization('Regular text')).toBe(false)
  })

  it('should detect multiple dashes', () => {
    expect(needsNormalization('-- Test')).toBe(true)
    expect(needsNormalization('--- Test')).toBe(true)
    expect(needsNormalization('- Test')).toBe(false)
  })

  it('should detect header spacing issues', () => {
    expect(needsNormalization('## Header\nContent')).toBe(true)
    expect(needsNormalization('## Header\n\nContent')).toBe(false)
    expect(needsNormalization('## Header')).toBe(false)
  })

  it('should handle empty/null content', () => {
    expect(needsNormalization('')).toBe(false)
    expect(needsNormalization(null as any)).toBe(false)
    expect(needsNormalization(undefined as any)).toBe(false)
  })
})

describe('normalizeDealPointsContent', () => {
  it('should normalize bullets in dealPoints structure', () => {
    const input = {
      bullets: [
        '• Location: 1333 North Milwaukee Street',
        '• Total units: 197 apartments',
        'Already normalized bullet'
      ],
      citations: [
        { page: 3, text: 'location info' },
        { page: 4, text: 'units info' },
        { page: 5, text: 'other info' }
      ],
      source: 'cache'
    }

    const expected = {
      bullets: [
        'Location: 1333 North Milwaukee Street',
        'Total units: 197 apartments', 
        'Already normalized bullet'
      ],
      citations: [
        { page: 3, text: 'location info' },
        { page: 4, text: 'units info' },
        { page: 5, text: 'other info' }
      ],
      source: 'cache'
    }

    const result = normalizeDealPointsContent(input, 'test-request-id')
    
    expect(result).toEqual(expected)
  })

  it('should handle empty or malformed dealPoints', () => {
    const input = { bullets: [] }
    const result = normalizeDealPointsContent(input, 'test-request-id')
    
    expect(result.bullets).toEqual([])
  })

  it('should preserve non-string bullets', () => {
    const input = { 
      bullets: ['• Text bullet', null, undefined, 123, '• Another text bullet'] as any[]
    }

    const result = normalizeDealPointsContent(input, 'test-request-id')
    
    expect(result.bullets).toEqual(['Text bullet', null, undefined, 123, 'Another text bullet'])
  })
})