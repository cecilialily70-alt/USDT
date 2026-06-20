import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Star } from 'lucide-react';

const Reviews = () => {
  const { t } = useLanguage();

  const reviews = [
    {
      text: t.reviews.review1,
      name: t.reviews.name1,
      rating: 5
    },
    {
      text: t.reviews.review2,
      name: t.reviews.name2,
      rating: 5
    },
    {
      text: t.reviews.review3,
      name: t.reviews.name3,
      rating: 5
    },
    {
      text: t.reviews.review4,
      name: t.reviews.name4,
      rating: 5
    },
    {
      text: t.reviews.review5,
      name: t.reviews.name5,
      rating: 5
    },
    {
      text: t.reviews.review6,
      name: t.reviews.name6,
      rating: 5
    }
  ];

  return (
    <section id="reviews" className="relative py-24 bg-[#0B0F19]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {t.reviews.title}
          </h2>
          <p className="text-gray-400 text-lg md:text-xl">
            {t.reviews.subtitle}
          </p>
        </div>

        {/* Reviews Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((review, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-[#1a2332] to-[#0f1621] border border-white/10 rounded-2xl p-6 hover:border-[#26A17B]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#26A17B]/10"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(review.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#FFB800] text-[#FFB800]" />
                ))}
              </div>

              {/* Review Text */}
              <p className="text-gray-300 mb-6 leading-relaxed italic">
                {review.text}
              </p>

              {/* Reviewer Name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#26A17B] to-[#1a7a5e] flex items-center justify-center text-white font-bold">
                  {review.name.charAt(0)}
                </div>
                <div>
                  <div className="text-white font-semibold">{review.name}</div>
                  <div className="text-gray-500 text-sm">Verified Customer</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Reviews;