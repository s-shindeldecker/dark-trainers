import styled from '@emotion/styled';
import { Link } from 'react-router-dom';

const PageHero = styled.section`
  background: #35524A;
  color: #fff;
  text-align: center;
  padding: 5em 2em;
`;

const PageHeroTitle = styled.h1`
  font-size: 2.8em;
  margin: 0 0 0.3em;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.15;
`;

const PageHeroSubtitle = styled.p`
  font-size: 1.2em;
  max-width: 600px;
  margin: 0 auto;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.6;
`;

const Section = styled.section<{ alt?: boolean }>(({ alt }) => ({
  padding: '4em 2em',
  background: alt ? '#F6E7CB' : '#fff',
}));

const SectionInner = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const SectionTitle = styled.h2`
  font-size: 2em;
  color: #35524A;
  text-align: center;
  margin-bottom: 0.3em;
`;

const SectionSubtitle = styled.p`
  text-align: center;
  color: #6A994E;
  font-size: 1.1em;
  margin-bottom: 2.5em;
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 2em;
`;

const ApproachCard = styled.div`
  background: #fff;
  border-radius: 16px;
  padding: 2em 1.5em;
  box-shadow: 0 2px 12px rgba(53, 82, 74, 0.07);
  text-align: center;
`;

const CardIcon = styled.div`
  font-size: 2.4em;
  margin-bottom: 0.4em;
`;

const CardTitle = styled.h3`
  font-size: 1.2em;
  color: #35524A;
  margin-bottom: 0.5em;
`;

const CardText = styled.p`
  font-size: 0.95em;
  color: #555;
  line-height: 1.6;
`;

const Callout = styled.blockquote`
  max-width: 700px;
  margin: 0 auto;
  font-size: 1.25em;
  font-style: italic;
  color: #35524A;
  border-left: 4px solid #FFD166;
  padding: 1em 1.5em;
  background: rgba(255, 209, 102, 0.1);
  border-radius: 0 8px 8px 0;
  line-height: 1.6;
`;

const RecipeCard = styled.div`
  background: #fff;
  border-radius: 16px;
  padding: 2em 1.5em;
  box-shadow: 0 2px 12px rgba(53, 82, 74, 0.07);
  text-align: center;
`;

const RecipeEmoji = styled.div`
  font-size: 3em;
  margin-bottom: 0.3em;
`;

const RecipeName = styled.h3`
  font-size: 1.15em;
  color: #35524A;
  margin-bottom: 0.4em;
`;

const RecipeDesc = styled.p`
  font-size: 0.9em;
  color: #6A994E;
  line-height: 1.5;
`;

const CTASection = styled.section`
  background: #35524A;
  text-align: center;
  padding: 4em 2em;
`;

const CTATitle = styled.h2`
  color: #fff;
  font-size: 2em;
  margin-bottom: 0.3em;
`;

const CTAText = styled.p`
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.1em;
  margin-bottom: 2em;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
`;

const CTAButton = styled(Link)`
  display: inline-block;
  background: #FFD166;
  color: #35524A;
  padding: 1em 2.5em;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.15em;
  text-decoration: none;
  transition: background 0.2s;
  &:hover {
    background: #FFC233;
  }
`;

const approachItems = [
  {
    icon: '🩺',
    title: 'Vet-Formulated',
    text: 'Our recipes are developed by board-certified veterinary nutritionists with decades of clinical experience, ensuring optimal nutrition at every stage of life.',
  },
  {
    icon: '✅',
    title: 'Complete and Balanced',
    text: 'Every recipe meets AAFCO standards for complete and balanced nutrition. We test every batch for quality and safety before it leaves our kitchens.',
  },
  {
    icon: '🥗',
    title: 'Human-Grade Standards',
    text: 'We use human-grade ingredients and cook in facilities that meet the same strict safety standards as human food production. No shortcuts, ever.',
  },
  {
    icon: '🌿',
    title: 'Minimally Processed',
    text: 'Our food avoids the risks of ultra-processing. No artificial preservatives, no fillers, no mystery powders. Just real food your pet can thrive on.',
  },
  {
    icon: '🍳',
    title: 'Gently Cooked',
    text: 'Our meals are fully cooked at temperatures that eliminate pathogens while preserving natural nutrients, moisture, and the flavors pets love.',
  },
];

const recipes = [
  { emoji: '🐔', name: 'Chicken & Sweet Potato', desc: 'Lean protein with nutrient-rich sweet potato and garden vegetables.' },
  { emoji: '🐄', name: 'Beef & Brown Rice', desc: 'Hearty beef with whole grains for sustained energy and strong muscles.' },
  { emoji: '🦃', name: 'Turkey & Pumpkin', desc: 'Easy-to-digest turkey with pumpkin for gentle stomachs and sensitive pups.' },
  { emoji: '🐖', name: 'Pork & Green Bean', desc: 'A novel protein option with fiber-rich green beans and essential vitamins.' },
];

const OurFood = () => (
  <>
    <PageHero>
      <PageHeroTitle>Good ingredients are only the beginning</PageHeroTitle>
      <PageHeroSubtitle>
        It's how we use them that makes all the difference. Our recipes are made to human-grade safety standards,
        never ultra-processed, and always designed for your pet's long-term health.
      </PageHeroSubtitle>
    </PageHero>

    <Section>
      <SectionInner>
        <SectionTitle>Turning good ingredients into great food</SectionTitle>
        <SectionSubtitle>
          We've combined decades of veterinary science with common sense to make smarter, healthier pet food.
        </SectionSubtitle>
        <CardGrid>
          {approachItems.map((item) => (
            <ApproachCard key={item.title}>
              <CardIcon>{item.icon}</CardIcon>
              <CardTitle>{item.title}</CardTitle>
              <CardText>{item.text}</CardText>
            </ApproachCard>
          ))}
        </CardGrid>
      </SectionInner>
    </Section>

    <Section alt>
      <SectionInner>
        <SectionTitle>What do we mean by fresh?</SectionTitle>
        <Callout>
          The answer is simple — quality and safety. Fresh standards are the highest we can adhere to in making
          healthy pet food. Every step of our sourcing, cooking, packaging, and storage process meets the same
          strict standards as those for human food. If it's not good enough for your table, it's not good enough
          for your pet's bowl.
        </Callout>
      </SectionInner>
    </Section>

    <Section>
      <SectionInner>
        <SectionTitle>Our Recipes</SectionTitle>
        <SectionSubtitle>
          Single-protein recipes made with whole vegetables, essential vitamins, and nothing your pet doesn't need.
        </SectionSubtitle>
        <CardGrid>
          {recipes.map((r) => (
            <RecipeCard key={r.name}>
              <RecipeEmoji>{r.emoji}</RecipeEmoji>
              <RecipeName>{r.name}</RecipeName>
              <RecipeDesc>{r.desc}</RecipeDesc>
            </RecipeCard>
          ))}
        </CardGrid>
      </SectionInner>
    </Section>

    <CTASection>
      <CTATitle>Ready to make the switch?</CTATitle>
      <CTAText>
        Let our AI assistant help you find the perfect Gravity Farms plan for your pet.
      </CTAText>
      <CTAButton to="/signup">Find Your Perfect Plan</CTAButton>
    </CTASection>
  </>
);

export default OurFood;
