window.DEFAULT_DATA = {
  adminAuth: { username: 'admin', password: '123456' },
  users: [
    { id: '12345', name: 'นักเรียนตัวอย่าง', password: '123', role: 'student', class: 'ม.6/1' }
  ],
  reports: [
    {
      id: 'REP-001',
      reporterName: 'นักเรียนตัวอย่าง',
      reporterId: '12345',
      classroom: 'ม.6/1',
      title: 'ไฟในห้องเรียนไม่สว่าง',
      category: 'ไฟฟ้า',
      location: 'ห้อง 601',
      datetime: '2026-08-01T09:00',
      description: 'หลอดไฟในห้องเรียนดับอยู่หลายจุด',
      photos: [],
      status: 'completed',
      resolutionDate: '2026-08-02',
      notes: 'เปลี่ยนหลอดไฟเรียบร้อยแล้ว'
    }
  ],
  achievements: [
    {
      id: 'ACH-001',
      headline: 'โครงการพัฒนาห้องสมุด',
      content: 'รวบรวมของใช้และจัดพื้นที่อ่านหนังสือให้สะดวกขึ้น',
      date: '2026-07-15',
      responsible: 'สภานักเรียน',
      imgUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800'
    }
  ],
  news: [
    {
      id: 'NEWS-001',
      headline: 'ประกาศประชุมสภานักเรียน',
      content: 'ประชุมสภานักเรียนในวันพุธนี้ เวลา 15.00 น.',
      date: '2026-08-04',
      imgUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=800'
    }
  ],
  links: [
    {
      id: 'LINK-001',
      name: 'เว็บไซต์โรงเรียน',
      url: 'https://example.com',
      category: 'โรงเรียน'
    }
  ],
  songs: [],
  lostFound: [],
  chats: {}
};
