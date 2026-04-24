'use client'

import { useRef, useState } from 'react'
import { Button, Carousel, Flex, Typography, theme } from 'antd'
import type { CarouselRef } from 'antd/es/carousel'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { ThemeRadarItem } from '@/types/recommendations'
import { ThemeCard } from './ThemeCard'

const { Text } = Typography
const { useToken } = theme

const SLIDES_PER_PAGE = 4

interface CoreThemeCarouselProps {
  themes: ThemeRadarItem[]
}

export function CoreThemeCarousel({ themes }: CoreThemeCarouselProps) {
  const ref = useRef<CarouselRef>(null)
  const { token } = useToken()
  const [slideIndex, setSlideIndex] = useState(0)
  if (themes.length === 0) return null

  const totalPages = Math.max(1, Math.ceil(themes.length / SLIDES_PER_PAGE))
  const currentPage = Math.min(totalPages, Math.floor(slideIndex / SLIDES_PER_PAGE) + 1)
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  return (
    <div>
      <Carousel
        ref={ref}
        arrows={false}
        dots={false}
        infinite={false}
        accessibility
        autoplay={false}
        adaptiveHeight={false}
        draggable
        slidesToShow={SLIDES_PER_PAGE}
        slidesToScroll={SLIDES_PER_PAGE}
        afterChange={setSlideIndex}
        responsive={[
          { breakpoint: 1024, settings: { slidesToShow: 2, slidesToScroll: 2 } },
          { breakpoint: 768, settings: { slidesToShow: 1, slidesToScroll: 1 } },
        ]}
      >
        {themes.map((th) => (
          <div key={th.id}>
            <div style={{ padding: '4px 6px' }}>
              <ThemeCard theme={th} variant="core" />
            </div>
          </div>
        ))}
      </Carousel>
      <Flex justify="center" align="center" gap={12} style={{ marginTop: 16 }}>
        <Button
          shape="circle"
          size="small"
          icon={<LeftOutlined />}
          onClick={() => ref.current?.prev()}
          disabled={!canPrev}
          aria-label="Previous"
        />
        <Text
          style={{
            fontFamily: token.fontFamilyCode,
            fontSize: token.fontSizeSM,
            color: token.colorTextTertiary,
            minWidth: 40,
            textAlign: 'center',
          }}
        >
          {currentPage} / {totalPages}
        </Text>
        <Button
          shape="circle"
          size="small"
          icon={<RightOutlined />}
          onClick={() => ref.current?.next()}
          disabled={!canNext}
          aria-label="Next"
        />
      </Flex>
    </div>
  )
}
