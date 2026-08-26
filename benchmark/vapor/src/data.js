import { ref } from 'vue'

let adjectives = [
  'pretty', 'large', 'big', 'small', 'tiny', 'normal', 'good', 'bad', 'great',
  'hot', 'nice', 'terrible', 'awesome', 'unique', 'fair', 'irrational',
  'loving', 'large', 'sleek', 'dirty', 'frozen', 'fearless', 'fluffy',
  'crying', 'humble', 'minuscule', 'ancient', 'crusty', 'fresh', 'red',
  'blue', 'green', 'yellow', 'purple', 'black', 'white', 'gray', 'brown',
]

let colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'shiny', 'reptile', 'amazing', 'odd', 'strange', 'fabulous',
  'wonderful', 'bright', 'dark', 'glossy', 'wet', 'humid', 'dry', 'proud',
  'brave', 'angry', 'grumpy', 'sleepy', 'quiet', 'loud', 'happy', 'sad',
]

let nouns = [
  'table', 'chair', 'house', 'dog', 'cat', 'bird', 'fish', 'lion', 'tiger',
  'wolf', 'bear', 'fox', 'rabbit', 'horse', 'cow', 'pig', 'sheep', 'goat',
  'duck', 'chicken', 'car', 'truck', 'bus', 'bike', 'train', 'plane', 'ship',
  'boat', 'rock', 'tree', 'flower', 'grass', 'river', 'lake', 'sea', 'ocean',
  'mountain', 'valley', 'city', 'village',
]

function _random(max) {
  return Math.round(Math.random() * 1000) % max
}

// Per-row label refs (official vue-vapor-keyed design): update() mutates
// only the touched rows' refs, so exactly those rows re-render.
export function buildData(count = 1000) {
  const data = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: i + 1,
      label: ref(
        `${adjectives[_random(adjectives.length)]} ${
          colours[_random(colours.length)]
        } ${nouns[_random(nouns.length)]}`
      ),
    })
  }
  return data
}
