// Mock data for B2B dashboard — used when real data is empty

export const MOCK_ARTIST_GRADES = [
  {
    id: 'mock-1', star_id: 'mock-star-1', grade: 'explosive', grade_score: 94,
    influence_score: 8.72, keyword_count: 12,
    grade_breakdown: { explosive: 3, commerce: 4, intent: 2, spread: 2, react: 1 },
    computed_at: new Date().toISOString(),
    star: { id: 'mock-star-1', display_name: 'SEVENTEEN', name_ko: '세븐틴', agency: 'PLEDIS Entertainment', image_url: null },
  },
  {
    id: 'mock-2', star_id: 'mock-star-2', grade: 'commerce', grade_score: 87,
    influence_score: 7.45, keyword_count: 9,
    grade_breakdown: { commerce: 3, intent: 3, spread: 2, react: 1 },
    computed_at: new Date().toISOString(),
    star: { id: 'mock-star-2', display_name: 'aespa', name_ko: '에스파', agency: 'SM Entertainment', image_url: null },
  },
  {
    id: 'mock-3', star_id: 'mock-star-3', grade: 'intent', grade_score: 78,
    influence_score: 6.31, keyword_count: 7,
    grade_breakdown: { intent: 3, spread: 2, react: 1, spark: 1 },
    computed_at: new Date().toISOString(),
    star: { id: 'mock-star-3', display_name: 'IVE', name_ko: '아이브', agency: 'Starship Entertainment', image_url: null },
  },
  {
    id: 'mock-4', star_id: 'mock-star-4', grade: 'spread', grade_score: 72,
    influence_score: 5.88, keyword_count: 8,
    grade_breakdown: { spread: 4, react: 2, spark: 2 },
    computed_at: new Date().toISOString(),
    star: { id: 'mock-star-4', display_name: 'NewJeans', name_ko: '뉴진스', agency: 'ADOR', image_url: null },
  },
  {
    id: 'mock-5', star_id: 'mock-star-5', grade: 'commerce', grade_score: 69,
    influence_score: 5.12, keyword_count: 6,
    grade_breakdown: { commerce: 2, intent: 2, spread: 1, react: 1 },
    computed_at: new Date().toISOString(),
    star: { id: 'mock-star-5', display_name: 'Byeon Wooseok', name_ko: '변우석', agency: 'Varo Entertainment', image_url: null },
  },
  {
    id: 'mock-6', star_id: 'mock-star-6', grade: 'react', grade_score: 58,
    influence_score: 4.23, keyword_count: 5,
    grade_breakdown: { react: 3, spark: 2 },
    computed_at: new Date().toISOString(),
    star: { id: 'mock-star-6', display_name: 'BOYNEXTDOOR', name_ko: '보이넥스트도어', agency: 'KOZ Entertainment', image_url: null },
  },
  {
    id: 'mock-7', star_id: 'mock-star-7', grade: 'explosive', grade_score: 91,
    influence_score: 8.15, keyword_count: 10,
    grade_breakdown: { explosive: 2, commerce: 3, intent: 2, spread: 2, react: 1 },
    computed_at: new Date().toISOString(),
    star: { id: 'mock-star-7', display_name: 'BLACKPINK', name_ko: '블랙핑크', agency: 'YG Entertainment', image_url: null },
  },
];

const now = Date.now();
const h = (hours: number) => new Date(now - hours * 3600000).toISOString();

export const MOCK_ACTIVE_TRENDS = [
  // SEVENTEEN
  { id: 'mt-1', keyword: '세븐틴 x 디올', keyword_category: 'brand', artist_name: 'SEVENTEEN', star_id: 'mock-star-1', influence_index: 92, trend_score: 0.94, trend_grade: 'explosive', purchase_stage: 'purchase', source_image_url: null, detected_at: h(2) },
  { id: 'mt-2', keyword: '정한 향수 컬렉션', keyword_category: 'product', artist_name: 'SEVENTEEN', star_id: 'mock-star-1', influence_index: 85, trend_score: 0.87, trend_grade: 'commerce', purchase_stage: 'consideration', source_image_url: null, detected_at: h(5) },
  { id: 'mt-3', keyword: '호시 체육관 웨어', keyword_category: 'fashion', artist_name: 'SEVENTEEN', star_id: 'mock-star-1', influence_index: 78, trend_score: 0.80, trend_grade: 'commerce', purchase_stage: 'awareness', source_image_url: null, detected_at: h(8) },
  { id: 'mt-4', keyword: '세븐틴 팝업스토어 성수', keyword_category: 'event', artist_name: 'SEVENTEEN', star_id: 'mock-star-1', influence_index: 74, trend_score: 0.76, trend_grade: 'intent', purchase_stage: 'consideration', source_image_url: null, detected_at: h(10) },
  // aespa
  { id: 'mt-5', keyword: '윈터 코스메틱 앰배서더', keyword_category: 'beauty', artist_name: 'aespa', star_id: 'mock-star-2', influence_index: 88, trend_score: 0.90, trend_grade: 'commerce', purchase_stage: 'purchase', source_image_url: null, detected_at: h(3) },
  { id: 'mt-6', keyword: '카리나 x 프라다', keyword_category: 'brand', artist_name: 'aespa', star_id: 'mock-star-2', influence_index: 82, trend_score: 0.84, trend_grade: 'explosive', purchase_stage: 'consideration', source_image_url: null, detected_at: h(6) },
  { id: 'mt-7', keyword: '에스파 래스토랑 성수 방문', keyword_category: 'restaurant', artist_name: 'aespa', star_id: 'mock-star-2', influence_index: 65, trend_score: 0.67, trend_grade: 'spread', purchase_stage: 'awareness', source_image_url: null, detected_at: h(12) },
  // IVE
  { id: 'mt-8', keyword: '장원영 공항패션', keyword_category: 'fashion', artist_name: 'IVE', star_id: 'mock-star-3', influence_index: 80, trend_score: 0.82, trend_grade: 'intent', purchase_stage: 'consideration', source_image_url: null, detected_at: h(4) },
  { id: 'mt-9', keyword: '안유진 x 샤넬', keyword_category: 'brand', artist_name: 'IVE', star_id: 'mock-star-3', influence_index: 76, trend_score: 0.78, trend_grade: 'intent', purchase_stage: 'awareness', source_image_url: null, detected_at: h(7) },
  // NewJeans
  { id: 'mt-10', keyword: '하니 빈티지 카페', keyword_category: 'restaurant', artist_name: 'NewJeans', star_id: 'mock-star-4', influence_index: 72, trend_score: 0.74, trend_grade: 'spread', purchase_stage: 'awareness', source_image_url: null, detected_at: h(9) },
  { id: 'mt-11', keyword: '민지 x 버버리', keyword_category: 'brand', artist_name: 'NewJeans', star_id: 'mock-star-4', influence_index: 70, trend_score: 0.72, trend_grade: 'spread', purchase_stage: 'consideration', source_image_url: null, detected_at: h(11) },
  // Byeon Wooseok
  { id: 'mt-12', keyword: '변우석 x 까르띠에', keyword_category: 'brand', artist_name: 'Byeon Wooseok', star_id: 'mock-star-5', influence_index: 75, trend_score: 0.77, trend_grade: 'commerce', purchase_stage: 'purchase', source_image_url: null, detected_at: h(5) },
  { id: 'mt-13', keyword: '변우석 이탈리안 레스토랑', keyword_category: 'restaurant', artist_name: 'Byeon Wooseok', star_id: 'mock-star-5', influence_index: 58, trend_score: 0.60, trend_grade: 'react', purchase_stage: 'awareness', source_image_url: null, detected_at: h(15) },
  // BOYNEXTDOOR
  { id: 'mt-14', keyword: '보이넥스트도어 컴백 무대', keyword_category: 'media', artist_name: 'BOYNEXTDOOR', star_id: 'mock-star-6', influence_index: 62, trend_score: 0.64, trend_grade: 'react', purchase_stage: 'awareness', source_image_url: null, detected_at: h(13) },
  { id: 'mt-15', keyword: '성한빈 헤어스타일', keyword_category: 'beauty', artist_name: 'BOYNEXTDOOR', star_id: 'mock-star-6', influence_index: 55, trend_score: 0.57, trend_grade: 'spark', purchase_stage: null, source_image_url: null, detected_at: h(18) },
  // BLACKPINK
  { id: 'mt-16', keyword: '지수 x 디올 컬렉션', keyword_category: 'brand', artist_name: 'BLACKPINK', star_id: 'mock-star-7', influence_index: 95, trend_score: 0.97, trend_grade: 'explosive', purchase_stage: 'purchase', source_image_url: null, detected_at: h(1) },
  { id: 'mt-17', keyword: '리사 불가리 광고', keyword_category: 'brand', artist_name: 'BLACKPINK', star_id: 'mock-star-7', influence_index: 90, trend_score: 0.92, trend_grade: 'explosive', purchase_stage: 'consideration', source_image_url: null, detected_at: h(3) },
  { id: 'mt-18', keyword: '로제 생로랑 파리 이벤트', keyword_category: 'event', artist_name: 'BLACKPINK', star_id: 'mock-star-7', influence_index: 83, trend_score: 0.85, trend_grade: 'commerce', purchase_stage: 'awareness', source_image_url: null, detected_at: h(6) },
];
