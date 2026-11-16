export const SAMPLE_BREEDERS = [
  {
    id: "b1",
    name: "Hodowla Aura Maine",
    handle: "@aura_maine",
    city: "Warszawa",
    breed: "Maine Coon",
    verified: true,
    avatar:
      "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=200&q=80",
    followers: 4820,
  },
  {
    id: "b2",
    name: "Biały Wilk Kennel",
    handle: "@bialywilk",
    city: "Kraków",
    breed: "Samoyed",
    verified: true,
    avatar:
      "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=200&q=80",
    followers: 3110,
  },
  {
    id: "b3",
    name: "Nero Britania",
    handle: "@nero_britania",
    city: "Wrocław",
    breed: "British Shorthair",
    verified: false,
    avatar:
      "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?auto=format&fit=crop&w=200&q=80",
    followers: 980,
  },
  {
    id: "b4",
    name: "Złota Sfora",
    handle: "@zlotasfora",
    city: "Poznań",
    breed: "Golden Retriever",
    verified: true,
    avatar:
      "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=200&q=80",
    followers: 7640,
  },
];

export const SAMPLE_POSTS = [
  {
    id: "p1",
    author: "Hodowla Aura Maine",
    handle: "@aura_maine",
    avatar: SAMPLE_BREEDERS[0].avatar,
    verified: true,
    city: "Warszawa",
    breed: "Maine Coon",
    caption:
      "Trzy tygodnie i pierwsze wyjście z gniazda. Luna pilnuje całej trójki, jakby miała dyplom z zarządzania kryzysowego.",
    image:
      "https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=1200&q=80",
    likes: 1284,
    comments: 42,
    tags: ["maine coon", "kocięta", "rodowód"],
  },
  {
    id: "p2",
    author: "Złota Sfora",
    handle: "@zlotasfora",
    avatar: SAMPLE_BREEDERS[3].avatar,
    verified: true,
    city: "Poznań",
    breed: "Golden Retriever",
    caption:
      "Pierwszy śnieg w tym roku. Niko uznał, że to prywatny basen i nie zamierza wracać do domu.",
    image:
      "https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1200&q=80",
    likes: 2310,
    comments: 87,
    tags: ["golden retriever", "zima"],
  },
  {
    id: "p3",
    author: "Biały Wilk Kennel",
    handle: "@bialywilk",
    avatar: SAMPLE_BREEDERS[1].avatar,
    verified: true,
    city: "Kraków",
    breed: "Samoyed",
    caption:
      "Badanie oczu i stawów zaliczone. Rodowód ZKwP, pełna dokumentacja hodowlana dostępna w profilu.",
    image:
      "https://images.unsplash.com/photo-1560807707-8cc77767d783?auto=format&fit=crop&w=1200&q=80",
    likes: 964,
    comments: 21,
    tags: ["samoyed", "zdrowie", "ZKwP"],
  },
];

export const SAMPLE_DAILY = {
  game: "PURRE 2048",
  target: 800,
  reward: 120,
};
